import type { SupabaseClient } from "@supabase/supabase-js";
import { lineBayar, lineKurangBayar, summarizeHutangFromLines } from "@/lib/posting/hutang";
import type { PurchaseLineMetadata, PurchaseLineRow } from "@/lib/posting/types";

type PurchaseCategoryRow = {
  id: string;
  category: string;
  sub_category: string;
  coa_account: string;
};

type OrderRecord = {
  id: string;
  po_no: string;
  order_date: string;
  total: number;
  status: string;
  supplier_id: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
};

export type PembelianHistoryFilters = {
  start: string;
  end: string;
  supplierId?: string;
};

export type PembelianHistoryOrderRow = {
  id: string;
  poNo: string;
  orderDate: string;
  supplierId: string | null;
  supplierName: string;
  status: string;
  grandTotal: number;
  bayar: number;
  sisaTagihan: number;
};

export type PembelianHistoryBundle = {
  rows: PembelianHistoryOrderRow[];
  linesByOrder: Map<string, PurchaseLineRow[]>;
  categories: Map<string, PurchaseCategoryRow>;
  suppliers: Map<string, string>;
};

export type ExportPurchaseLine = {
  orderDate: string;
  poNo: string;
  supplierName: string;
  supplierId: string | null;
  orderStatus: string;
  description: string;
  categoryLabel: string;
  akunPembelian: string;
  qty: number;
  unitCode: string;
  unitCost: number;
  diskon: number;
  lineTotal: number;
  bayar: number;
  kurangBayar: number;
  metode: string;
};

async function loadSuppliers(
  supabase: SupabaseClient,
  orgId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("active", true)
    .order("name");

  const map = new Map<string, string>();
  for (const s of data || []) {
    map.set(s.id, s.name);
  }
  return map;
}

async function loadPurchaseCategories(
  supabase: SupabaseClient,
  orgId: string
): Promise<Map<string, PurchaseCategoryRow>> {
  const { data } = await supabase
    .from("purchase_categories")
    .select("id, category, sub_category, coa_account")
    .eq("organization_id", orgId)
    .eq("active", true);

  const map = new Map<string, PurchaseCategoryRow>();
  for (const c of data || []) {
    map.set(c.id, c as PurchaseCategoryRow);
  }
  return map;
}

function categoryLabel(cat: PurchaseCategoryRow | undefined): string {
  if (!cat) return "Tanpa kategori";
  if (cat.sub_category && cat.sub_category !== cat.category) {
    return `${cat.category} — ${cat.sub_category}`;
  }
  return cat.category;
}

function mapLineForExport(
  line: PurchaseLineRow,
  categories: Map<string, PurchaseCategoryRow>
): Pick<
  ExportPurchaseLine,
  | "description"
  | "categoryLabel"
  | "akunPembelian"
  | "qty"
  | "unitCode"
  | "unitCost"
  | "diskon"
  | "lineTotal"
  | "bayar"
  | "kurangBayar"
  | "metode"
> {
  const meta = (line.metadata || {}) as PurchaseLineMetadata;
  const catId = meta.purchaseCategoryId;
  const cat = catId ? categories.get(catId) : undefined;

  return {
    description: line.description,
    categoryLabel: categoryLabel(cat),
    akunPembelian: String(meta.akunPembelian || cat?.coa_account || ""),
    qty: Number(line.qty) || 0,
    unitCode: String(meta.unitCode || "PCS"),
    unitCost: Number(line.unit_cost) || 0,
    diskon: Number(meta.diskon) || 0,
    lineTotal: Number(line.line_total) || 0,
    bayar: lineBayar(line),
    kurangBayar: lineKurangBayar(line),
    metode: String(meta.metode || "")
  };
}

export async function fetchPembelianHistory(
  supabase: SupabaseClient,
  orgId: string,
  filters: PembelianHistoryFilters
): Promise<PembelianHistoryBundle> {
  let query = supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, total, status, supplier_id, metadata, created_at")
    .eq("organization_id", orgId)
    .gte("order_date", filters.start)
    .lte("order_date", filters.end)
    .neq("status", "DRAFT")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.supplierId) {
    query = query.eq("supplier_id", filters.supplierId);
  }

  const { data: orders, error } = await query;
  if (error) throw new Error(error.message);

  const orderList = (orders || []) as OrderRecord[];
  const orderIds = orderList.map((o) => o.id);

  const { data: lineRows, error: lineErr } = orderIds.length
    ? await supabase.from("purchase_lines").select("*").in("purchase_order_id", orderIds)
    : { data: [], error: null };

  if (lineErr) throw new Error(lineErr.message);

  const lines = (lineRows || []) as PurchaseLineRow[];
  const linesByOrder = new Map<string, PurchaseLineRow[]>();
  for (const line of lines) {
    const bucket = linesByOrder.get(line.purchase_order_id) || [];
    bucket.push(line);
    linesByOrder.set(line.purchase_order_id, bucket);
  }

  const suppliers = await loadSuppliers(supabase, orgId);
  const categories = await loadPurchaseCategories(supabase, orgId);

  const rows: PembelianHistoryOrderRow[] = orderList.map((order) => {
    const meta = order.metadata || {};
    const orderLines = linesByOrder.get(order.id) || [];
    const supplierName =
      (order.supplier_id && suppliers.get(order.supplier_id)) ||
      String(meta.supplierName || "");
    const hutang = summarizeHutangFromLines(order, orderLines);
    const grandTotal =
      orderLines.reduce((s, l) => s + Number(l.line_total) || 0, 0) || Number(order.total) || 0;
    const isVoided = order.status === "VOIDED";
    const bayar =
      orderLines.reduce((s, l) => s + lineBayar(l), 0) || Number(meta.bayar) || 0;

    return {
      id: order.id,
      poNo: order.po_no,
      orderDate: order.order_date,
      supplierId: order.supplier_id,
      supplierName,
      status: order.status,
      grandTotal,
      bayar,
      sisaTagihan: isVoided ? 0 : (hutang?.sisaTagihan ?? 0)
    };
  });

  return { rows, linesByOrder, categories, suppliers };
}

export function flattenLinesForExport(bundle: PembelianHistoryBundle): ExportPurchaseLine[] {
  const out: ExportPurchaseLine[] = [];

  for (const row of bundle.rows) {
    if (row.status === "VOIDED") continue;

    const orderLines = bundle.linesByOrder.get(row.id) || [];
    for (const line of orderLines) {
      out.push({
        ...mapLineForExport(line, bundle.categories),
        orderDate: row.orderDate,
        poNo: row.poNo,
        supplierName: row.supplierName,
        supplierId: row.supplierId,
        orderStatus: row.status
      });
    }
  }

  return out;
}
