import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDefaultCoa } from "@/lib/coa/seed-default-coa";
import { formatWibDateLabel, wibMonthStartIso, wibTodayIso } from "@/lib/date/wib";
import { buildLabaRugi, fetchReportData } from "@/lib/laporan";
import { summarizeHutangFromLines } from "@/lib/posting/hutang";
import { computeSaldoByAccountName, type KasBankAccount } from "@/lib/posting/mutasi";
import { summarizePiutangFromLines } from "@/lib/posting/piutang";
import type { PurchaseLineRow, SalesLineRow } from "@/lib/posting/types";
import { escapeTelegramHtml, formatIdr } from "@/lib/telegram/bot";
import {
  fetchDailyDigestStats,
  type DailyDigestStats
} from "@/lib/telegram/daily-digest";

const OPERATIONAL_STATUSES = ["CONFIRMED", "POSTED"] as const;

type DbResult = { error: { message: string } | null };

function throwIfDbError(label: string, res: DbResult): void {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
}

export type OwnerRingkasan = {
  date: string;
  monthStart: string;
  daily: DailyDigestStats;
  kasAccounts: Array<{ name: string; saldo: number }>;
  totalKasSaldo: number;
  totalPiutang: number;
  totalHutang: number;
  omsetBulanIni: number;
  labaBersihBulanIni: number;
  pendingPostInvoices: number;
  pendingPostPurchaseOrders: number;
};

export async function fetchOwnerRingkasan(
  supabase: SupabaseClient,
  organizationId: string,
  dateIso = wibTodayIso()
): Promise<OwnerRingkasan> {
  const monthStart = wibMonthStartIso();

  const [
    daily,
    salesMonthRes,
    salesOpenRes,
    purchaseOpenRes,
    kasAccountsRes,
    transfersRes,
    salesPiutangRes,
    purchaseHutangRes
  ] = await Promise.all([
    fetchDailyDigestStats(supabase, organizationId, dateIso),
    supabase
      .from("sales_orders")
      .select("total")
      .eq("organization_id", organizationId)
      .in("status", [...OPERATIONAL_STATUSES])
      .gte("order_date", monthStart)
      .lte("order_date", dateIso),
    supabase
      .from("sales_orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "CONFIRMED"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "CONFIRMED"),
    supabase
      .from("cash_bank_accounts")
      .select("id, name, coa_account_name, active")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("cash_transfers")
      .select("kind, amount, source_account_name, dest_account_name, status, metadata")
      .eq("organization_id", organizationId),
    supabase
      .from("sales_orders")
      .select("id, order_no, order_date, total, customer_id, metadata, status")
      .eq("organization_id", organizationId)
      .in("status", [...OPERATIONAL_STATUSES])
      .order("order_date", { ascending: false })
      .limit(80),
    supabase
      .from("purchase_orders")
      .select("id, po_no, order_date, total, supplier_id, metadata, status")
      .eq("organization_id", organizationId)
      .in("status", [...OPERATIONAL_STATUSES])
      .order("order_date", { ascending: false })
      .limit(80)
  ]);

  throwIfDbError("sales_orders bulan", salesMonthRes);
  throwIfDbError("sales_orders backlog", salesOpenRes);
  throwIfDbError("purchase_orders backlog", purchaseOpenRes);
  throwIfDbError("cash_bank_accounts", kasAccountsRes);
  throwIfDbError("cash_transfers", transfersRes);
  throwIfDbError("sales_orders piutang", salesPiutangRes);
  throwIfDbError("purchase_orders hutang", purchaseHutangRes);

  const salesOrderIds = (salesPiutangRes.data || []).map((o) => o.id);
  const purchaseOrderIds = (purchaseHutangRes.data || []).map((o) => o.id);

  const [salesLinesRes, purchaseLinesRes, labaBersihBulanIni] = await Promise.all([
    salesOrderIds.length
      ? supabase.from("sales_lines").select("*").in("sales_order_id", salesOrderIds)
      : Promise.resolve({ data: [] as SalesLineRow[] }),
    purchaseOrderIds.length
      ? supabase.from("purchase_lines").select("*").in("purchase_order_id", purchaseOrderIds)
      : Promise.resolve({ data: [] as PurchaseLineRow[] }),
    fetchLabaBersihBulanIni(supabase, organizationId, monthStart, dateIso)
  ]);

  throwIfDbError("sales_lines", salesLinesRes as DbResult);
  throwIfDbError("purchase_lines", purchaseLinesRes as DbResult);

  const salesLinesByOrder = new Map<string, SalesLineRow[]>();
  for (const line of salesLinesRes.data || []) {
    const bucket = salesLinesByOrder.get(line.sales_order_id) || [];
    bucket.push(line as SalesLineRow);
    salesLinesByOrder.set(line.sales_order_id, bucket);
  }

  const purchaseLinesByOrder = new Map<string, PurchaseLineRow[]>();
  for (const line of purchaseLinesRes.data || []) {
    const bucket = purchaseLinesByOrder.get(line.purchase_order_id) || [];
    bucket.push(line as PurchaseLineRow);
    purchaseLinesByOrder.set(line.purchase_order_id, bucket);
  }

  let totalPiutang = 0;
  for (const order of salesPiutangRes.data || []) {
    const row = summarizePiutangFromLines(
      order as {
        id: string;
        order_no: string;
        order_date: string;
        customer_id: string | null;
        total: number;
        status: string;
        metadata: Record<string, unknown>;
      },
      salesLinesByOrder.get(order.id) || []
    );
    if (row) totalPiutang += row.sisaTagihan;
  }

  let totalHutang = 0;
  for (const order of purchaseHutangRes.data || []) {
    const hutang = summarizeHutangFromLines(
      order as {
        id: string;
        po_no: string;
        order_date: string;
        supplier_id: string | null;
        total: number;
        metadata: Record<string, unknown>;
      },
      purchaseLinesByOrder.get(order.id) || []
    );
    if (hutang && order.status !== "VOIDED") {
      totalHutang += hutang.sisaTagihan;
    }
  }

  const kasAccountList = (kasAccountsRes.data || []) as KasBankAccount[];
  const saldoMap = computeSaldoByAccountName(kasAccountList, (transfersRes.data || []) as never[]);
  const kasAccounts = kasAccountList.map((a) => ({
    name: a.name,
    saldo: Number(saldoMap[a.name]) || 0
  }));
  const totalKasSaldo = kasAccounts.reduce((sum, a) => sum + a.saldo, 0);

  const omsetBulanIni = (salesMonthRes.data || []).reduce(
    (sum, o) => sum + (Number(o.total) || 0),
    0
  );

  return {
    date: dateIso,
    monthStart,
    daily,
    kasAccounts,
    totalKasSaldo,
    totalPiutang,
    totalHutang,
    omsetBulanIni,
    labaBersihBulanIni,
    pendingPostInvoices: salesOpenRes.count ?? 0,
    pendingPostPurchaseOrders: purchaseOpenRes.count ?? 0
  };
}

async function fetchLabaBersihBulanIni(
  supabase: SupabaseClient,
  organizationId: string,
  monthStart: string,
  dateIso: string
): Promise<number> {
  try {
    await ensureDefaultCoa(supabase, organizationId);
    const data = await fetchReportData(supabase, organizationId, dateIso);
    const report = buildLabaRugi(data.coa, data.journalLines, {
      start: monthStart,
      end: dateIso
    });
    return report.labaBersih;
  } catch {
    return 0;
  }
}

export function formatOwnerRingkasanMessage(orgName: string, ringkasan: OwnerRingkasan): string {
  const { daily: stats } = ringkasan;
  const dateLabel = formatWibDateLabel(stats.date);
  const name = escapeTelegramHtml(orgName);

  const lines = [
    `📊 <b>${name}</b> — ${escapeTelegramHtml(dateLabel)}`,
    "",
    "<b>Posisi</b>",
    `  • Kas/bank total: ${formatIdr(ringkasan.totalKasSaldo)}`
  ];

  for (const acc of ringkasan.kasAccounts) {
    lines.push(`    – ${escapeTelegramHtml(acc.name)}: ${formatIdr(acc.saldo)}`);
  }

  lines.push(
    `  • Piutang: ${formatIdr(ringkasan.totalPiutang)} · Utang: ${formatIdr(ringkasan.totalHutang)}`,
    "",
    "<b>Bulan ini</b> <i>(s/d hari ini)</i>",
    `  • Omset: ${formatIdr(ringkasan.omsetBulanIni)}`,
    `  • Laba bersih: ${formatIdr(ringkasan.labaBersihBulanIni)}`,
    "",
    "<b>Hari ini</b>",
    "<b>Penjualan</b>",
    `  • ${stats.salesCount} invoice · ${formatIdr(stats.salesTotal)}`
  );
  if (stats.salesUnposted > 0) {
    lines.push(`  <i>(${stats.salesUnposted} belum post jurnal)</i>`);
  }
  lines.push(
    "",
    "<b>Pembelian</b>",
    `  • ${stats.purchaseCount} PO · ${formatIdr(stats.purchaseTotal)}`
  );
  if (stats.purchaseUnposted > 0) {
    lines.push(`  <i>(${stats.purchaseUnposted} belum post jurnal)</i>`);
  }
  lines.push(
    "",
    "<b>Piutang</b>",
    `  • Pelunasan masuk: ${stats.piutangPaymentCount} · ${formatIdr(stats.piutangPaymentTotal)}`,
    `  • Tagihan baru: ${stats.piutangNewCount} · ${formatIdr(stats.piutangNewTotal)}`,
    "",
    "<b>Utang</b>",
    `  • Pelunasan keluar: ${stats.hutangPaymentCount} · ${formatIdr(stats.hutangPaymentTotal)}`,
    `  • Tagihan baru: ${stats.hutangNewCount} · ${formatIdr(stats.hutangNewTotal)}`
  );

  const pendingInv = ringkasan.pendingPostInvoices;
  const pendingPo = ringkasan.pendingPostPurchaseOrders;
  if (pendingInv > 0 || pendingPo > 0) {
    const parts: string[] = [];
    if (pendingInv > 0) parts.push(`${pendingInv} invoice`);
    if (pendingPo > 0) parts.push(`${pendingPo} PO`);
    lines.push("", `⚠️ ${parts.join(" + ")} belum post jurnal`);
  }

  lines.push(
    "",
    "<i>Omset &amp; pergerakan hari ini: confirmed/posted. Laba: jurnal posted. Void tidak termasuk.</i>"
  );

  return lines.join("\n");
}
