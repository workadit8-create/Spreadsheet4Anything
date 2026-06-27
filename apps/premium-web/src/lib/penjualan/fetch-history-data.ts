import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consignmentSupplierIdFromMetadata,
  isConsignmentProduct
} from "@/lib/products/consignment-policy";
import type { SalesLineRow } from "@/lib/posting/types";
import {
  buildDetail,
  mapLineForHistory,
  summarizeOrderForHistory,
  type HistoryDetail,
  type HistoryLineRow,
  type HistoryOrderRow
} from "./history";

type ProductJoin = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  metadata: Record<string, unknown>;
  product_categories: { name: string } | { name: string }[] | null;
  units: { code: string } | { code: string }[] | null;
};

type OrderRecord = {
  id: string;
  order_no: string;
  order_date: string;
  total: number;
  status: string;
  customer_id: string | null;
  outlet_code: string | null;
  metadata: Record<string, unknown>;
};

export type PenjualanHistoryFilters = {
  start: string;
  end: string;
  customerId?: string;
  supplierId?: string;
  outletCode?: string;
};

export type PenjualanHistoryBundle = {
  rows: HistoryOrderRow[];
  linesByOrder: Map<string, SalesLineRow[]>;
  products: Map<string, ProductJoin>;
  customers: Map<string, string>;
  grandTotalSum: number;
};

async function loadCustomers(
  supabase: SupabaseClient,
  orgId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("customers")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("active", true)
    .order("name");

  const map = new Map<string, string>();
  for (const c of data || []) {
    map.set(c.id, c.name);
  }
  return map;
}

async function loadProductsForLines(
  supabase: SupabaseClient,
  orgId: string,
  lines: SalesLineRow[]
): Promise<Map<string, ProductJoin>> {
  const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))] as string[];
  if (!productIds.length) return new Map();

  const { data } = await supabase
    .from("products")
    .select(
      "id, name, sku, category_id, metadata, product_categories(name), units(code)"
    )
    .eq("organization_id", orgId)
    .in("id", productIds);

  const map = new Map<string, ProductJoin>();
  for (const p of data || []) {
    map.set(p.id, p as ProductJoin);
  }
  return map;
}

export async function fetchPenjualanHistory(
  supabase: SupabaseClient,
  orgId: string,
  filters: PenjualanHistoryFilters
): Promise<PenjualanHistoryBundle> {
  let query = supabase
    .from("sales_orders")
    .select("id, order_no, order_date, total, status, customer_id, outlet_code, metadata, created_at")
    .eq("organization_id", orgId)
    .gte("order_date", filters.start)
    .lte("order_date", filters.end)
    .neq("status", "DRAFT")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }
  if (filters.outletCode) {
    query = query.eq("outlet_code", filters.outletCode);
  }

  const { data: orders, error } = await query;
  if (error) throw new Error(error.message);

  const orderList = (orders || []) as OrderRecord[];
  const orderIds = orderList.map((o) => o.id);

  const { data: lineRows, error: lineErr } = orderIds.length
    ? await supabase.from("sales_lines").select("*").in("sales_order_id", orderIds)
    : { data: [], error: null };

  if (lineErr) throw new Error(lineErr.message);

  const lines = (lineRows || []) as SalesLineRow[];
  const linesByOrder = new Map<string, SalesLineRow[]>();
  for (const line of lines) {
    const bucket = linesByOrder.get(line.sales_order_id) || [];
    bucket.push(line);
    linesByOrder.set(line.sales_order_id, bucket);
  }

  const customers = await loadCustomers(supabase, orgId);
  const products = await loadProductsForLines(supabase, orgId, lines);

  const supplierFilter = filters.supplierId?.trim() || "";
  let filteredOrders = orderList;
  if (supplierFilter) {
    filteredOrders = orderList.filter((order) => {
      const orderLines = linesByOrder.get(order.id) || [];
      return orderLines.some((line) => {
        if (!line.product_id) return false;
        const product = products.get(line.product_id);
        if (!product || !isConsignmentProduct(product.metadata)) return false;
        return consignmentSupplierIdFromMetadata(product.metadata) === supplierFilter;
      });
    });
  }

  let grandTotalSum = 0;
  const rows: HistoryOrderRow[] = filteredOrders.map((order) => {
    const orderLines = linesByOrder.get(order.id) || [];
    const customerName =
      (order.customer_id && customers.get(order.customer_id)) ||
      String((order.metadata || {}).customerName || "");
    const row = summarizeOrderForHistory(order, orderLines, customerName);
    if (row.status !== "VOIDED") {
      grandTotalSum += row.grandTotal;
    }
    return row;
  });

  return { rows, linesByOrder, products, customers, grandTotalSum };
}

export async function fetchPenjualanDetail(
  supabase: SupabaseClient,
  orgId: string,
  orderId: string
): Promise<HistoryDetail | null> {
  const { data: order, error } = await supabase
    .from("sales_orders")
    .select("id, order_no, order_date, total, status, customer_id, metadata")
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return null;

  const { data: lineRows, error: lineErr } = await supabase
    .from("sales_lines")
    .select("*")
    .eq("sales_order_id", orderId)
    .order("sort_order");

  if (lineErr) throw new Error(lineErr.message);

  const lines = (lineRows || []) as SalesLineRow[];
  const products = await loadProductsForLines(supabase, orgId, lines);
  const customers = await loadCustomers(supabase, orgId);
  const customerName =
    (order.customer_id && customers.get(order.customer_id)) ||
    String((order.metadata || {}).customerName || "");

  return buildDetail(order as OrderRecord, lines, products, customerName);
}

export function flattenLinesForExport(
  bundle: PenjualanHistoryBundle
): Array<HistoryLineRow & { orderNo: string; orderDate: string; customerName: string }> {
  const out: Array<HistoryLineRow & { orderNo: string; orderDate: string; customerName: string }> =
    [];

  for (const row of bundle.rows) {
    const orderLines = bundle.linesByOrder.get(row.id) || [];
    for (const line of orderLines) {
      const product = line.product_id ? bundle.products.get(line.product_id) : null;
      const mapped = mapLineForHistory(line, product);
      out.push({
        ...mapped,
        orderNo: row.orderNo,
        orderDate: row.orderDate,
        customerName: row.customerName
      });
    }
  }

  return out;
}
