import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { postJournalEntry } from "@/lib/posting/journal-supabase";
import {
  buildConsignmentSettlementJournalLines,
  consignmentSettlementTransactionId
} from "@/lib/posting/journal-rules";
import {
  generateConsignmentSettlementNo,
  generateTransactionId
} from "@/lib/posting/ids";
import {
  insertLinkedKeluarMutasi,
  linkedMutasiTransactionId,
  resolveKasBankAccount
} from "@/lib/posting/linked-mutasi";
import { wibDateIsoFromInput, wibTodayIso } from "@/lib/date/wib";

type CreateBody = {
  supplier_id: string;
  settlement_date?: string;
  rekening?: string;
  notes?: string;
  liability_ids?: string[];
};

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const addons = await fetchOrgAddons(supabase, org.id);
  if (!isAddonEnabled(addons, "titip_jual") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on titip jual tidak aktif" }, { status: 403 });
  }

  const url = new URL(request.url);
  const supplierId = String(url.searchParams.get("supplier_id") || "").trim();

  let liabQuery = supabase
    .from("consignment_liabilities")
    .select(
      "id, sales_order_id, product_id, qty, unit_settlement, total_amount, status, created_at, suppliers(name), products(name), sales_orders(order_no, order_date)"
    )
    .eq("organization_id", org.id)
    .eq("status", "OPEN")
    .order("created_at", { ascending: true });

  if (supplierId) liabQuery = liabQuery.eq("supplier_id", supplierId);

  const { data: liabilities, error: liabErr } = await liabQuery;
  if (liabErr) return NextResponse.json({ error: liabErr.message }, { status: 500 });

  const openItems = (liabilities || []).map((row) => {
    const sup = row.suppliers as { name: string } | { name: string }[] | null;
    const prod = row.products as { name: string } | { name: string }[] | null;
    const so = row.sales_orders as
      | { order_no: string; order_date: string }
      | { order_no: string; order_date: string }[]
      | null;
    const order = Array.isArray(so) ? so[0] : so;
    return {
      id: row.id,
      salesOrderId: row.sales_order_id,
      orderNo: order?.order_no || "—",
      orderDate: order?.order_date || "",
      productName: (Array.isArray(prod) ? prod[0]?.name : prod?.name) || "—",
      supplierName: (Array.isArray(sup) ? sup[0]?.name : sup?.name) || "—",
      qty: Number(row.qty) || 0,
      unitSettlement: Number(row.unit_settlement) || 0,
      totalAmount: Number(row.total_amount) || 0
    };
  });

  const { data: settlements, error: setErr } = await supabase
    .from("consignment_settlements")
    .select("id, settlement_no, settlement_date, total, status, suppliers(name)")
    .eq("organization_id", org.id)
    .order("settlement_date", { ascending: false })
    .limit(50);

  if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });

  const history = (settlements || []).map((row) => {
    const sup = row.suppliers as { name: string } | { name: string }[] | null;
    return {
      id: row.id,
      settlementNo: row.settlement_no,
      settlementDate: row.settlement_date,
      total: Number(row.total) || 0,
      status: row.status,
      supplierName: (Array.isArray(sup) ? sup[0]?.name : sup?.name) || "—"
    };
  });

  return NextResponse.json({
    openLiabilities: openItems,
    openTotal: openItems.reduce((s, i) => s + i.totalAmount, 0),
    settlements: history
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const addons = await fetchOrgAddons(supabase, org.id);
  if (!isAddonEnabled(addons, "titip_jual") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on titip jual tidak aktif" }, { status: 403 });
  }

  const body = (await request.json()) as CreateBody;
  const supplierId = String(body.supplier_id || "").trim();
  if (!supplierId) {
    return NextResponse.json({ error: "Supplier wajib" }, { status: 400 });
  }

  const rekening = String(body.rekening || "").trim();
  if (!rekening) {
    return NextResponse.json({ error: "Rekening kas/bank wajib" }, { status: 400 });
  }

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("id", supplierId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!supplier) {
    return NextResponse.json({ error: "Supplier tidak ditemukan" }, { status: 400 });
  }

  let liabQuery = supabase
    .from("consignment_liabilities")
    .select("id, total_amount, status, supplier_id")
    .eq("organization_id", org.id)
    .eq("supplier_id", supplierId)
    .eq("status", "OPEN");

  const liabilityIds = (body.liability_ids || []).map((id) => String(id).trim()).filter(Boolean);
  if (liabilityIds.length) {
    liabQuery = liabQuery.in("id", liabilityIds);
  }

  const { data: liabilities, error: liabErr } = await liabQuery;
  if (liabErr) return NextResponse.json({ error: liabErr.message }, { status: 500 });
  if (!liabilities?.length) {
    return NextResponse.json({ error: "Tidak ada hutang titip terbuka untuk supplier ini" }, { status: 400 });
  }

  const total = Math.round(
    liabilities.reduce((s, l) => s + (Number(l.total_amount) || 0), 0)
  );
  if (total <= 0) {
    return NextResponse.json({ error: "Total settlement harus > 0" }, { status: 400 });
  }

  const settlementDate = body.settlement_date
    ? wibDateIsoFromInput(body.settlement_date)
    : wibTodayIso();
  const settlementNo = generateConsignmentSettlementNo();
  const headerTxId = generateTransactionId();

  const { data: settlement, error: setInsErr } = await supabase
    .from("consignment_settlements")
    .insert({
      organization_id: org.id,
      settlement_no: settlementNo,
      settlement_date: settlementDate,
      supplier_id: supplierId,
      total,
      rekening,
      status: "POSTED",
      notes: String(body.notes || "").trim() || null,
      metadata: { transactionId: headerTxId },
      created_by: user.id
    })
    .select("id, settlement_no")
    .single();

  if (setInsErr || !settlement) {
    return NextResponse.json({ error: setInsErr?.message || "Gagal buat settlement" }, { status: 500 });
  }

  const journalLines = buildConsignmentSettlementJournalLines({
    entryDate: settlementDate,
    settlementNo,
    supplierName: supplier.name,
    total,
    rekening
  });

  const journalResult = await postJournalEntry(
    supabase,
    {
      organizationId: org.id,
      modul: "TITIP_JUAL_SETTLEMENT",
      transactionId: consignmentSettlementTransactionId(settlement.id),
      docNo: settlementNo,
      entryDate: settlementDate,
      sourceDocType: "CONSIGNMENT_SETTLEMENT",
      sourceDocId: settlement.id
    },
    journalLines
  );

  const { data: kasAccounts } = await supabase
    .from("cash_bank_accounts")
    .select("id, name, coa_account_name")
    .eq("organization_id", org.id)
    .eq("active", true);

  const kasAccount = resolveKasBankAccount(rekening, kasAccounts || []);
  if (kasAccount) {
    await insertLinkedKeluarMutasi(supabase, {
      organizationId: org.id,
      transferDate: settlementDate,
      account: kasAccount,
      counterpartyLabel: `Settlement titip: ${supplier.name}`,
      amount: total,
      keterangan: `Pelunasan titip ${settlementNo}`,
      transactionId: linkedMutasiTransactionId("CS", headerTxId),
      sourceType: "CONSIGNMENT_SETTLEMENT",
      sourceId: settlement.id,
      journalHandledBy: "TITIP_JUAL_SETTLEMENT"
    });
  }

  const liabilityIdsToSettle = liabilities.map((l) => l.id);
  const { error: updErr } = await supabase
    .from("consignment_liabilities")
    .update({
      status: "SETTLED",
      settlement_id: settlement.id
    })
    .in("id", liabilityIdsToSettle)
    .eq("organization_id", org.id)
    .eq("status", "OPEN");

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    settlementId: settlement.id,
    settlementNo: settlement.settlement_no,
    total,
    journalPosted: !journalResult.skipped,
    liabilityCount: liabilityIdsToSettle.length
  });
}
