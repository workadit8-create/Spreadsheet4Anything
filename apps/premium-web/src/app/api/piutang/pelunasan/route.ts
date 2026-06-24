import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { generatePiutangTransactionId } from "@/lib/posting/ids";
import {
  allocatePelunasanToLines,
  lineKurangBayar,
  summarizePiutangFromLines
} from "@/lib/posting/piutang";
import type { SalesLineRow } from "@/lib/posting/types";

type Body = {
  sales_order_id: string;
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
  const salesOrderId = String(body.sales_order_id || "").trim();
  const nominal = Number(body.nominal);
  const tanggalBayar = body.tanggal || new Date().toISOString().slice(0, 10);
  const rekening = String(body.rekening || "Kas").trim();
  const keterangan = String(body.keterangan || "").trim();

  if (!salesOrderId) return NextResponse.json({ error: "Invoice wajib dipilih" }, { status: 400 });
  if (!nominal || nominal <= 0) return NextResponse.json({ error: "Nominal harus > 0" }, { status: 400 });

  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .select("id, order_no, order_date, total, customer_id, metadata, status")
    .eq("id", salesOrderId)
    .eq("organization_id", org.id)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 400 });
  }

  const { data: lines, error: linesErr } = await supabase
    .from("sales_lines")
    .select("*")
    .eq("sales_order_id", order.id)
    .order("sort_order");

  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  const lineRows = (lines || []) as SalesLineRow[];
  const summary = summarizePiutangFromLines(
    order as {
      id: string;
      order_no: string;
      order_date: string;
      customer_id: string | null;
      metadata: Record<string, unknown>;
    },
    lineRows
  );

  if (!summary || summary.sisaTagihan <= 0) {
    return NextResponse.json({ error: "Invoice ini tidak memiliki sisa piutang" }, { status: 400 });
  }

  if (nominal > summary.sisaTagihan + 0.01) {
    return NextResponse.json({
      error: `Nominal melebihi sisa piutang (${summary.sisaTagihan})`
    }, { status: 400 });
  }

  let updates: ReturnType<typeof allocatePelunasanToLines>;
  try {
    updates = allocatePelunasanToLines(lineRows, nominal, tanggalBayar);
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Gagal alokasi pelunasan"
    }, { status: 400 });
  }

  for (const upd of updates) {
    const { error: updErr } = await supabase
      .from("sales_lines")
      .update({ metadata: upd.metadata })
      .eq("id", upd.lineId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const orderMeta = (order.metadata || {}) as Record<string, unknown>;
  const newOrderBayar = Number(orderMeta.bayar || 0) + nominal;
  const newSisa = Math.max(0, summary.grandTotal - newOrderBayar);
  await supabase
    .from("sales_orders")
    .update({
      metadata: {
        ...orderMeta,
        bayar: newOrderBayar,
        paymentStatus: newSisa > 0 ? "PENJUALAN KREDIT" : "PENJUALAN TUNAI",
        tanggalBayar: newSisa <= 0 ? tanggalBayar : orderMeta.tanggalBayar
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", order.id);

  const transactionId = generatePiutangTransactionId();
  const customerName = String(orderMeta.customerName || summary.customerName || "");

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      organization_id: org.id,
      doc_type: "PIUTANG_PAYMENT",
      doc_id: order.id,
      method: rekening,
      amount: nominal,
      paid_at: new Date(tanggalBayar).toISOString(),
      metadata: {
        transactionId,
        invoiceNo: order.order_no,
        customerName,
        salesOrderId: order.id,
        rekening,
        keterangan: keterangan || `Pelunasan ${order.order_no}`,
        tanggalBayar
      }
    })
    .select("id")
    .single();

  if (payErr || !payment) {
    return NextResponse.json({ error: payErr?.message || "Gagal simpan payment" }, { status: 500 });
  }

  const { data: job, error: jobErr } = await supabase
    .from("posting_jobs")
    .insert({
      organization_id: org.id,
      doc_type: "PIUTANG_PAYMENT",
      doc_id: payment.id,
      status: "PENDING"
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message || "Gagal enqueue posting" }, { status: 500 });
  }

  const remaining = lineRows.reduce((sum, line) => {
    const updated = updates.find((u) => u.lineId === line.id);
    if (updated) {
      return sum + (updated.metadata.kurangBayar || 0);
    }
    return sum + lineKurangBayar(line);
  }, 0);

  return NextResponse.json({
    paymentId: payment.id,
    postingJobId: job.id,
    transactionId,
    sisaSetelah: remaining,
    message: "Pelunasan disimpan + posting job PENDING"
  });
}
