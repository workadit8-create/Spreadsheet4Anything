import type { SupabaseClient } from "@supabase/supabase-js";
import { OUTLET_PUSAT_CODE, OUTLET_PUSAT_LABEL } from "@/lib/outlets/constants";
import { outletSegmentKey } from "@/lib/outlets/helpers";

export type OutletLrRow = {
  outletCode: string;
  name: string;
  businessSector: string;
  pendapatan: number;
  beban: number;
  margin: number;
  marginPct: number;
};

export type OutletLrReport = {
  periode: { start: string; end: string };
  outlets: OutletLrRow[];
  pusat: OutletLrRow;
  konsolidasi: {
    pendapatan: number;
    beban: number;
    margin: number;
    marginPct: number;
  };
  untaggedSales: number;
  untaggedPurchases: number;
};

function inDateRange(dateVal: string | null, startDate?: string, endDate?: string): boolean {
  if (!dateVal) return false;
  if (!startDate && !endDate) return true;
  const t = new Date(`${dateVal.slice(0, 10)}T12:00:00`).getTime();
  if (startDate) {
    const s = new Date(`${startDate.slice(0, 10)}T00:00:00`).getTime();
    if (t < s) return false;
  }
  if (endDate) {
    const e = new Date(`${endDate.slice(0, 10)}T23:59:59`).getTime();
    if (t > e) return false;
  }
  return true;
}

type SegmentAgg = { pendapatan: number; beban: number };

function ensureSegment(map: Record<string, SegmentAgg>, key: string): SegmentAgg {
  if (!map[key]) map[key] = { pendapatan: 0, beban: 0 };
  return map[key];
}

export async function buildOutletLrReport(
  supabase: SupabaseClient,
  orgId: string,
  filters: { startDate?: string; endDate?: string }
): Promise<OutletLrReport> {
  const startDate = filters.startDate || "";
  const endDate = filters.endDate || "";
  const segments: Record<string, SegmentAgg> = {};
  let untaggedSales = 0;
  let untaggedPurchases = 0;

  const { data: outletRows } = await supabase
    .from("outlets")
    .select("outlet_code, name, business_sector")
    .eq("organization_id", orgId)
    .eq("active", true);

  const masterMap = new Map(
    (outletRows || []).map((o) => [
      o.outlet_code,
      { name: o.name, businessSector: o.business_sector }
    ])
  );
  masterMap.set(OUTLET_PUSAT_CODE, { name: OUTLET_PUSAT_LABEL, businessSector: "pusat" });

  let salesQuery = supabase
    .from("sales_orders")
    .select("outlet_code, order_date, total")
    .eq("organization_id", orgId);

  if (startDate) salesQuery = salesQuery.gte("order_date", startDate);
  if (endDate) salesQuery = salesQuery.lte("order_date", endDate);

  const { data: salesRows } = await salesQuery;
  for (const row of salesRows || []) {
    const total = Number(row.total) || 0;
    if (!inDateRange(row.order_date, startDate, endDate)) continue;
    const key = outletSegmentKey(row.outlet_code);
    if (!row.outlet_code) untaggedSales += 1;
    ensureSegment(segments, key).pendapatan += total;
  }

  let poQuery = supabase
    .from("purchase_orders")
    .select("outlet_code, order_date, total")
    .eq("organization_id", orgId);

  if (startDate) poQuery = poQuery.gte("order_date", startDate);
  if (endDate) poQuery = poQuery.lte("order_date", endDate);

  const { data: poRows } = await poQuery;
  for (const row of poRows || []) {
    const total = Number(row.total) || 0;
    if (!inDateRange(row.order_date, startDate, endDate)) continue;
    const key = outletSegmentKey(row.outlet_code);
    if (!row.outlet_code) untaggedPurchases += 1;
    ensureSegment(segments, key).beban += total;
  }

  const { data: coaRows } = await supabase
    .from("coa_accounts")
    .select("name, account_type")
    .eq("organization_id", orgId)
    .eq("active", true);

  const accountType = new Map((coaRows || []).map((c) => [c.name, c.account_type]));

  let jlQuery = supabase
    .from("journal_lines")
    .select("outlet_code, line_date, account_name, debit, credit")
    .eq("organization_id", orgId);

  if (startDate) jlQuery = jlQuery.gte("line_date", startDate);
  if (endDate) jlQuery = jlQuery.lte("line_date", endDate);

  const { data: journalLines } = await jlQuery;
  for (const line of journalLines || []) {
    if (!line.outlet_code) continue;
    if (!inDateRange(line.line_date, startDate, endDate)) continue;
    const key = outletSegmentKey(line.outlet_code);
    const type = accountType.get(line.account_name) || "";
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    const seg = ensureSegment(segments, key);
    if (type === "Beban" && debit > 0) seg.beban += debit;
    if (type === "Pendapatan" && credit > 0) seg.pendapatan += credit;
  }

  const outletCodes = new Set([
    ...(outletRows || []).map((o) => o.outlet_code),
    OUTLET_PUSAT_CODE
  ]);

  const rows: OutletLrRow[] = [];
  for (const code of outletCodes) {
    if (code === OUTLET_PUSAT_CODE) continue;
    const agg = segments[code] || { pendapatan: 0, beban: 0 };
    if (agg.pendapatan === 0 && agg.beban === 0) continue;
    const meta = masterMap.get(code);
    const margin = agg.pendapatan - agg.beban;
    rows.push({
      outletCode: code,
      name: meta?.name || code,
      businessSector: meta?.businessSector || "",
      pendapatan: agg.pendapatan,
      beban: agg.beban,
      margin,
      marginPct: agg.pendapatan > 0 ? Math.round((margin / agg.pendapatan) * 1000) / 10 : 0
    });
  }
  rows.sort((a, b) => a.outletCode.localeCompare(b.outletCode, "id"));

  const pusatAgg = segments[OUTLET_PUSAT_CODE] || { pendapatan: 0, beban: 0 };
  const pusatMargin = pusatAgg.pendapatan - pusatAgg.beban;
  const pusat: OutletLrRow = {
    outletCode: OUTLET_PUSAT_CODE,
    name: OUTLET_PUSAT_LABEL,
    businessSector: "pusat",
    pendapatan: pusatAgg.pendapatan,
    beban: pusatAgg.beban,
    margin: pusatMargin,
    marginPct:
      pusatAgg.pendapatan > 0 ? Math.round((pusatMargin / pusatAgg.pendapatan) * 1000) / 10 : 0
  };

  const konsPendapatan = rows.reduce((s, r) => s + r.pendapatan, 0) + pusat.pendapatan;
  const konsBeban = rows.reduce((s, r) => s + r.beban, 0) + pusat.beban;
  const konsMargin = konsPendapatan - konsBeban;

  return {
    periode: { start: startDate, end: endDate },
    outlets: rows,
    pusat,
    konsolidasi: {
      pendapatan: konsPendapatan,
      beban: konsBeban,
      margin: konsMargin,
      marginPct:
        konsPendapatan > 0 ? Math.round((konsMargin / konsPendapatan) * 1000) / 10 : 0
    },
    untaggedSales,
    untaggedPurchases
  };
}
