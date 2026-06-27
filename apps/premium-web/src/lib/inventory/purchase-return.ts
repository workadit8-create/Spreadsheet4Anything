import type { SupabaseClient } from "@supabase/supabase-js";
import {
  purchaseStockLinesFromProducts,
  reverseProductHppFromPurchaseLines,
  type PurchaseStockLine
} from "@/lib/inventory/purchase-inventory";

export { purchaseStockLinesFromProducts };

export async function returnPurchaseStock(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    warehouseId: string;
    returnId: string;
    returnNo: string;
    lines: PurchaseStockLine[];
    createdBy?: string | null;
    notes?: string;
  }
): Promise<void> {
  const stockLines = params.lines.filter((l) => l.tracksStock && l.qty > 0);
  if (!stockLines.length) return;

  const productIds = [...new Set(stockLines.map((l) => l.productId))];
  const { data: levels, error: levelErr } = await supabase
    .from("stock_levels")
    .select("product_id, qty")
    .eq("organization_id", params.organizationId)
    .eq("warehouse_id", params.warehouseId)
    .in("product_id", productIds);

  if (levelErr) throw new Error(levelErr.message);

  const qtyMap = new Map((levels || []).map((r) => [r.product_id, Number(r.qty) || 0]));

  for (const line of stockLines) {
    const available = qtyMap.get(line.productId) ?? 0;
    if (available < line.qty) {
      throw new Error(`Stok tidak cukup untuk retur (produk ${line.productId})`);
    }
  }

  const { data: movement, error: movErr } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: params.organizationId,
      warehouse_id: params.warehouseId,
      movement_type: "OUT",
      source_type: "PURCHASE_RETURN",
      source_id: params.returnId,
      reference_no: params.returnNo,
      notes: params.notes || "Retur pembelian",
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (movErr || !movement) {
    throw new Error(movErr?.message || "Gagal buat stock movement retur");
  }

  const movementLines = stockLines.map((line) => ({
    movement_id: movement.id,
    product_id: line.productId,
    qty: line.qty
  }));

  const { error: lineErr } = await supabase.from("stock_movement_lines").insert(movementLines);
  if (lineErr) throw new Error(lineErr.message);

  for (const line of stockLines) {
    const current = qtyMap.get(line.productId) ?? 0;
    const qtyAfter = current - line.qty;

    const { error: upsertErr } = await supabase.from("stock_levels").upsert(
      {
        organization_id: params.organizationId,
        product_id: line.productId,
        warehouse_id: params.warehouseId,
        qty: qtyAfter,
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id,product_id,warehouse_id" }
    );

    if (upsertErr) throw new Error(upsertErr.message);
  }
}

export type ResolvedReturnLine = {
  product_id: string;
  purchase_line_id?: string | null;
  qty: number;
  unit_cost: number;
  line_total: number;
  dpp: number;
  tax_amount: number;
  metadata: Record<string, unknown>;
};

export async function sumReturnedQtyByPurchaseLine(
  supabase: SupabaseClient,
  organizationId: string,
  purchaseLineIds: string[]
): Promise<Map<string, number>> {
  if (!purchaseLineIds.length) return new Map();

  const { data: returns, error: retErr } = await supabase
    .from("purchase_returns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "POSTED");

  if (retErr) throw new Error(retErr.message);
  const returnIds = (returns || []).map((r) => r.id);
  if (!returnIds.length) return new Map();

  const { data, error } = await supabase
    .from("purchase_return_lines")
    .select("purchase_line_id, qty")
    .in("return_id", returnIds)
    .in("purchase_line_id", purchaseLineIds);

  if (error) throw new Error(error.message);

  const map = new Map<string, number>();
  for (const row of data || []) {
    const lineId = String(row.purchase_line_id || "");
    if (!lineId) continue;
    map.set(lineId, (map.get(lineId) || 0) + (Number(row.qty) || 0));
  }
  return map;
}

export function proportionalPoLineAmounts(
  poLine: { qty: number; line_total: number; metadata?: Record<string, unknown> | null },
  returnQty: number
): { dpp: number; taxAmount: number; lineTotal: number } {
  const poQty = Number(poLine.qty) || 0;
  if (poQty <= 0 || returnQty <= 0) {
    return { dpp: 0, taxAmount: 0, lineTotal: 0 };
  }
  const ratio = returnQty / poQty;
  const meta = (poLine.metadata || {}) as Record<string, unknown>;
  const dpp = Math.round((Number(meta.dpp) || 0) * ratio);
  const taxAmount = Math.round((Number(meta.taxAmount) || 0) * ratio);
  const lineTotal = Math.round((Number(poLine.line_total) || 0) * ratio);
  return { dpp, taxAmount, lineTotal: lineTotal || dpp + taxAmount };
}

export async function reverseHppForReturnLines(
  supabase: SupabaseClient,
  organizationId: string,
  lines: ResolvedReturnLine[]
): Promise<number> {
  return reverseProductHppFromPurchaseLines(
    supabase,
    organizationId,
    lines.map((l) => ({
      product_id: l.product_id,
      qty: l.qty,
      unit_cost: l.unit_cost,
      metadata: { dpp: l.dpp, diskon: 0 }
    }))
  );
}
