import type { SalesLineRow } from "@/lib/posting/types";
import { lineBayar, lineKurangBayar, summarizePiutangFromLines } from "@/lib/posting/piutang";

export type HistoryOrderRow = {
  id: string;
  orderNo: string;
  orderDate: string;
  customerId: string | null;
  customerName: string;
  status: string;
  grandTotal: number;
  bayar: number;
  sisaTagihan: number;
};

export type HistoryLineRow = {
  id: string;
  description: string;
  productId: string | null;
  productName: string;
  sku: string | null;
  categoryId: string | null;
  categoryName: string;
  qty: number;
  unitCode: string;
  unitPrice: number;
  diskon: number;
  lineTotal: number;
  bayar: number;
  kurangBayar: number;
  hpp: number;
};

export type HistoryDetail = {
  order: HistoryOrderRow;
  lines: HistoryLineRow[];
  isPosted: boolean;
};

type OrderRecord = {
  id: string;
  order_no: string;
  order_date: string;
  total: number;
  status: string;
  customer_id: string | null;
  metadata: Record<string, unknown>;
};

type ProductJoin = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  metadata: Record<string, unknown>;
  product_categories: { name: string } | { name: string }[] | null;
  units: { code: string } | { code: string }[] | null;
};

function unitCode(raw: ProductJoin["units"]): string {
  if (!raw) return "";
  const u = Array.isArray(raw) ? raw[0] : raw;
  return u?.code || "";
}

function categoryName(raw: ProductJoin["product_categories"]): string {
  if (!raw) return "";
  const c = Array.isArray(raw) ? raw[0] : raw;
  return c?.name || "";
}

function productHpp(meta: Record<string, unknown>): number {
  const hpp = Number(meta.hpp ?? meta.cost ?? meta.hargaPokok ?? 0);
  return Number.isFinite(hpp) ? hpp : 0;
}

export function summarizeOrderForHistory(
  order: OrderRecord,
  lines: SalesLineRow[],
  customerName?: string
): HistoryOrderRow {
  const meta = order.metadata || {};
  const lineGrandTotal = lines.reduce((sum, line) => sum + Number(line.line_total) || 0, 0);
  const piutang = summarizePiutangFromLines(order, lines);
  const grandTotal = lineGrandTotal || Number(order.total) || 0;
  const sisaTagihan = piutang?.sisaTagihan ?? 0;
  const bayar = Math.max(0, grandTotal - sisaTagihan);

  return {
    id: order.id,
    orderNo: order.order_no,
    orderDate: order.order_date,
    customerId: order.customer_id,
    customerName: customerName || String(meta.customerName || ""),
    status: order.status,
    grandTotal,
    bayar,
    sisaTagihan
  };
}

export function mapLineForHistory(
  line: SalesLineRow,
  product?: ProductJoin | null
): HistoryLineRow {
  const lineMeta = (line.metadata || {}) as Record<string, unknown>;
  const prodMeta = (product?.metadata || {}) as Record<string, unknown>;
  const diskon = Number(lineMeta.diskon) || 0;

  return {
    id: line.id,
    description: line.description,
    productId: line.product_id,
    productName: product?.name || line.description,
    sku: product?.sku || null,
    categoryId: product?.category_id || null,
    categoryName: product ? categoryName(product.product_categories) : "",
    qty: Number(line.qty) || 0,
    unitCode: String(lineMeta.unitCode || unitCode(product?.units ?? null) || ""),
    unitPrice: Number(line.unit_price) || 0,
    diskon,
    lineTotal: Number(line.line_total) || 0,
    bayar: lineBayar(line),
    kurangBayar: lineKurangBayar(line),
    hpp: productHpp(prodMeta)
  };
}

export function buildDetail(
  order: OrderRecord,
  lines: SalesLineRow[],
  products: Map<string, ProductJoin>,
  customerName?: string
): HistoryDetail {
  const summary = summarizeOrderForHistory(order, lines, customerName);
  const mappedLines = lines.map((l) =>
    mapLineForHistory(l, l.product_id ? products.get(l.product_id) : null)
  );

  return {
    order: summary,
    lines: mappedLines,
    isPosted: order.status === "POSTED" || order.status === "VOIDED"
  };
}
