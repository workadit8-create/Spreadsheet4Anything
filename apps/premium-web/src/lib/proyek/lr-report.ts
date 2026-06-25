import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProjectCode, rowToProjectDto } from "@/lib/proyek/helpers";
import type { ProjectLrRow, ProjectRow } from "@/lib/proyek/types";

type LrFilters = {
  startDate?: string;
  endDate?: string;
  status?: string;
  projectCode?: string;
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

export async function buildProjectLrReport(
  supabase: SupabaseClient,
  orgId: string,
  filters: LrFilters
) {
  const startDate = filters.startDate || "";
  const endDate = filters.endDate || "";
  const statusFilter = filters.status ? filters.status.trim().toUpperCase() : "";
  const codeFilter = filters.projectCode ? normalizeProjectCode(filters.projectCode) : "";

  const pendapatanMap: Record<string, number> = {};
  const bebanMap: Record<string, number> = {};

  let salesQuery = supabase
    .from("sales_orders")
    .select("project_code, order_date, total")
    .eq("organization_id", orgId)
    .not("project_code", "is", null);

  if (startDate) salesQuery = salesQuery.gte("order_date", startDate);
  if (endDate) salesQuery = salesQuery.lte("order_date", endDate);

  const { data: salesRows } = await salesQuery;
  for (const row of salesRows || []) {
    const code = normalizeProjectCode(row.project_code || "");
    if (!code) continue;
    pendapatanMap[code] = (pendapatanMap[code] || 0) + (Number(row.total) || 0);
  }

  let poQuery = supabase
    .from("purchase_orders")
    .select("project_code, order_date, total")
    .eq("organization_id", orgId)
    .not("project_code", "is", null);

  if (startDate) poQuery = poQuery.gte("order_date", startDate);
  if (endDate) poQuery = poQuery.lte("order_date", endDate);

  const { data: poRows } = await poQuery;
  for (const row of poRows || []) {
    const code = normalizeProjectCode(row.project_code || "");
    if (!code) continue;
    bebanMap[code] = (bebanMap[code] || 0) + (Number(row.total) || 0);
  }

  const { data: projectRows } = await supabase
    .from("projects")
    .select("*, customers(name)")
    .eq("organization_id", orgId);

  const masterMap: Record<string, ReturnType<typeof rowToProjectDto>> = {};
  for (const row of (projectRows || []) as ProjectRow[]) {
    masterMap[normalizeProjectCode(row.project_code)] = rowToProjectDto(row);
  }

  const allCodes = new Set<string>([
    ...Object.keys(pendapatanMap),
    ...Object.keys(bebanMap),
    ...Object.keys(masterMap)
  ]);

  const rows: ProjectLrRow[] = [];
  for (const code of allCodes) {
    const meta = masterMap[code];
    if (statusFilter && statusFilter !== "ALL" && meta && meta.status !== statusFilter) continue;
    if (codeFilter && code !== codeFilter) continue;

    const pendapatan = pendapatanMap[code] || 0;
    const beban = bebanMap[code] || 0;
    if (pendapatan === 0 && beban === 0 && !meta) continue;

    const margin = pendapatan - beban;
    rows.push({
      projectCode: code,
      name: meta?.name || code,
      customerName: meta?.customerName || "",
      eventDate: meta?.eventDate || "",
      status: meta?.status || "",
      location: meta?.location || "",
      pic: meta?.pic || "",
      pendapatan,
      beban,
      margin,
      marginPct: pendapatan > 0 ? Math.round((margin / pendapatan) * 1000) / 10 : 0
    });
  }

  rows.sort((a, b) => b.margin - a.margin || a.projectCode.localeCompare(b.projectCode, "id"));

  const totals = rows.reduce(
    (acc, r) => ({
      pendapatan: acc.pendapatan + r.pendapatan,
      beban: acc.beban + r.beban,
      margin: acc.margin + r.margin
    }),
    { pendapatan: 0, beban: 0, margin: 0 }
  );

  return {
    rows,
    totals: {
      ...totals,
      marginPct:
        totals.pendapatan > 0
          ? Math.round((totals.margin / totals.pendapatan) * 1000) / 10
          : 0
    },
    periode: { start: startDate, end: endDate }
  };
}

export async function buildProjectLrDetail(
  supabase: SupabaseClient,
  orgId: string,
  projectCode: string,
  startDate?: string,
  endDate?: string
) {
  const code = normalizeProjectCode(projectCode);
  if (!code) throw new Error("Kode proyek tidak valid.");

  const { data: salesRows } = await supabase
    .from("sales_orders")
    .select("order_no, order_date, total, customer_id, customers(name)")
    .eq("organization_id", orgId)
    .eq("project_code", code);

  const pemasukan = (salesRows || [])
    .filter((r) => inDateRange(r.order_date, startDate, endDate))
    .map((r) => {
      const cust = r.customers as { name: string } | { name: string }[] | null;
      const customerName = Array.isArray(cust) ? cust[0]?.name : cust?.name;
      return {
        tanggal: r.order_date,
        docNo: r.order_no,
        party: customerName || "",
        total: Number(r.total) || 0,
        jenis: "Invoice"
      };
    });

  const { data: poRows } = await supabase
    .from("purchase_orders")
    .select("po_no, order_date, total, supplier_id, suppliers(name)")
    .eq("organization_id", orgId)
    .eq("project_code", code);

  const pembelian = (poRows || [])
    .filter((r) => inDateRange(r.order_date, startDate, endDate))
    .map((r) => {
      const sup = r.suppliers as { name: string } | { name: string }[] | null;
      const supplierName = Array.isArray(sup) ? sup[0]?.name : sup?.name;
      return {
        tanggal: r.order_date,
        docNo: r.po_no,
        party: supplierName || "",
        total: Number(r.total) || 0,
        jenis: "PO"
      };
    });

  const pendapatan = pemasukan.reduce((a, r) => a + r.total, 0);
  const beban = pembelian.reduce((a, r) => a + r.total, 0);

  return {
    projectCode: code,
    pemasukan,
    pembelian,
    totals: {
      pendapatan,
      beban,
      margin: pendapatan - beban,
      marginPct: pendapatan > 0 ? Math.round(((pendapatan - beban) / pendapatan) * 1000) / 10 : 0
    },
    periode: { start: startDate || "", end: endDate || "" }
  };
}
