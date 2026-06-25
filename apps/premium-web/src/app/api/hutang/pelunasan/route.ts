import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { generateUtangTransactionId } from "@/lib/posting/ids";
import {
  allocatePelunasanToPurchaseLines,
  lineKurangBayar,
  summarizeHutangFromLines
} from "@/lib/posting/hutang";
import type { PurchaseLineRow } from "@/lib/posting/types";
import {
  insertLinkedKeluarMutasi,
  linkedMutasiTransactionId
} from "@/lib/posting/linked-mutasi";

type Body = {
  purchase_order_id: string;
  tanggal?: string;
  nominal: number;
  rekening?: string;
  keterangan?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const body = (await request.json()) as Body;
  const purchaseOrderId = String(body.purchase_order_id || "").trim();
  const nominal = Number(body.nominal);
  const tanggalBayar = body.tanggal || new Date().toISOString().slice(0, 10);
  const keterangan = String(body.keterangan || "").trim();

  if (!purchaseOrderId) {
    return NextResponse.json({ error: "PO wajib dipilih" }, { status: 400 });
  }
  if (!nominal || nominal <= 0) {
    return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });
  }

  const { data: kasAccounts, error: kasErr } = await supabase
    .from("cash_bank_accounts")
    .select("id, name, coa_account_name")
    .eq("organization_id", org.id)
    .eq("active", true);

  if (kasErr) return NextResponse.json({ error: kasErr.message }, { status: 500 });

  const rekeningInput = String(body.rekening || "Kas").trim();
  const kasMatch = (kasAccounts || []).find(
    (k) => k.name === rekeningInput || k.coa_account_name === rekeningInput
  );

  if (!kasMatch) {
    return NextResponse.json({
      error: `Rekening "${rekeningInput}" tidak ada di Master Kas & Bank.`
    }, { status: 400 });
  }

  const { data: order, error: orderErr } = await supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, total, supplier_id, metadata, status")
    .eq("id", purchaseOrderId)
    .eq("organization_id", org.id)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "PO tidak ditemukan" }, { status: 400 });
  }
  if (order.status !== "POSTED") {
    return NextResponse.json({
      error: "Pelunasan hanya untuk PO yang sudah diposting ke jurnal"
    }, { status: 400 });
  }

  const { data: lines, error: linesErr } = await supabase
    .from("purchase_lines")
    .select("*")
    .eq("purchase_order_id", order.id)
    .order("sort_order");

  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  const lineRows = (lines || []) as PurchaseLineRow[];
  const summary = summarizeHutangFromLines(
    order as {
      id: string;
      po_no: string;
      order_date: string;
      supplier_id: string | null;
      metadata: Record<string, unknown>;
    },
    lineRows
  );

  if (!summary || summary.sisaTagihan <= 0) {
    return NextResponse.json({ error: "PO ini tidak memiliki sisa hutang" }, { status: 400 });
  }

  if (nominal > summary.sisaTagihan + 0.01) {
    return NextResponse.json({
      error: `Nominal melebihi sisa hutang (${summary.sisaTagihan})`
    }, { status: 400 });
  }

  let updates: ReturnType<typeof allocatePelunasanToPurchaseLines>;
  try {
    updates = allocatePelunasanToPurchaseLines(lineRows, nominal, tanggalBayar);
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Gagal alokasi pelunasan"
    }, { status: 400 });
  }

  const lineRollbacks = updates.map((upd) => {
    const line = lineRows.find((l) => l.id === upd.lineId);
    return { lineId: upd.lineId, metadata: (line?.metadata || {}) as Record<string, unknown> };
  });

  for (const upd of updates) {
    const { error: updErr } = await supabase
      .from("purchase_lines")
      .update({ metadata: upd.metadata })
      .eq("id", upd.lineId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const newSisaFromLines = lineRows.reduce((sum, line) => {
    const updated = updates.find((u) => u.lineId === line.id);
    if (updated) return sum + (updated.metadata.kurangBayar || 0);
    return sum + lineKurangBayar(line);
  }, 0);
  const newOrderBayar = Math.max(0, summary.grandTotal - newSisaFromLines);
  const orderMeta = (order.metadata || {}) as Record<string, unknown>;

  await supabase
    .from("purchase_orders")
    .update({
      metadata: {
        ...orderMeta,
        bayar: newOrderBayar,
        paymentStatus: newSisaFromLines > 0 ? "Kredit" : "Tunai",
        tanggalBayar: newSisaFromLines <= 0 ? tanggalBayar : orderMeta.tanggalBayar
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", order.id);

  const transactionId = generateUtangTransactionId();
  const supplierName = String(orderMeta.supplierName || summary.supplierName || "");

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      organization_id: org.id,
      doc_type: "UTANG_PAYMENT",
      doc_id: order.id,
      method: kasMatch.name,
      amount: nominal,
      paid_at: new Date(tanggalBayar).toISOString(),
      status: "CONFIRMED",
      metadata: {
        transactionId,
        poNo: order.po_no,
        supplierName,
        purchaseOrderId: order.id,
        rekening: kasMatch.name,
        coaAccountName: kasMatch.coa_account_name,
        keterangan: keterangan || `Pelunasan ${order.po_no}`,
        tanggalBayar,
        lineRollbacks,
        orderMetaBefore: orderMeta
      }
    })
    .select("id")
    .single();

  if (payErr || !payment) {
    return NextResponse.json({ error: payErr?.message || "Gagal simpan payment" }, { status: 500 });
  }

  await insertLinkedKeluarMutasi(supabase, {
    organizationId: org.id,
    transferDate: tanggalBayar,
    account: kasMatch,
    counterpartyLabel: supplierName,
    amount: nominal,
    keterangan: keterangan || `Pelunasan ${order.po_no}`,
    transactionId: linkedMutasiTransactionId("UT", transactionId),
    sourceType: "UTANG_PAYMENT",
    sourceId: payment.id,
    journalHandledBy: "PELUNASAN_UTANG"
  });

  const remaining = lineRows.reduce((sum, line) => {
    const updated = updates.find((u) => u.lineId === line.id);
    if (updated) return sum + (updated.metadata.kurangBayar || 0);
    return sum + lineKurangBayar(line);
  }, 0);

  return NextResponse.json({
    paymentId: payment.id,
    transactionId,
    sisaSetelah: remaining,
    message: "Pelunasan hutang disimpan (CONFIRMED). Post jurnal dari riwayat pelunasan."
  });
}
