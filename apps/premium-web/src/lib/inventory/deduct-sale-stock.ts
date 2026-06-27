import type { SupabaseClient } from "@supabase/supabase-js";

export type SaleStockLine = {
  productId: string;
  qty: number;
  tracksStock: boolean;
};

export type DeductSaleStockResult = {
  negativeProducts: Array<{ productId: string; qtyAfter: number }>;
};

/**
 * Kurangi stok gudang untuk penjualan. Opsi retail offline: boleh minus (tidak diblok).
 */
export async function deductSaleStock(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    warehouseId: string;
    salesOrderId: string;
    orderNo: string;
    lines: SaleStockLine[];
    createdBy?: string | null;
    notes?: string;
  }
): Promise<DeductSaleStockResult> {
  const stockLines = params.lines.filter((l) => l.tracksStock && l.qty > 0);
  if (!stockLines.length) {
    return { negativeProducts: [] };
  }

  const productIds = [...new Set(stockLines.map((l) => l.productId))];
  const { data: levels, error: levelErr } = await supabase
    .from("stock_levels")
    .select("product_id, qty")
    .eq("organization_id", params.organizationId)
    .eq("warehouse_id", params.warehouseId)
    .in("product_id", productIds);

  if (levelErr) {
    throw new Error(levelErr.message);
  }

  const qtyMap = new Map((levels || []).map((r) => [r.product_id, Number(r.qty) || 0]));
  const negativeProducts: Array<{ productId: string; qtyAfter: number }> = [];

  const { data: movement, error: movErr } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: params.organizationId,
      warehouse_id: params.warehouseId,
      movement_type: "OUT",
      source_type: "SALES_ORDER",
      source_id: params.salesOrderId,
      reference_no: params.orderNo,
      notes: params.notes || "Penjualan",
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (movErr || !movement) {
    throw new Error(movErr?.message || "Gagal buat stock movement");
  }

  const movementLines: Array<{
    movement_id: string;
    product_id: string;
    qty: number;
  }> = [];

  for (const line of stockLines) {
    const current = qtyMap.get(line.productId) ?? 0;
    const qtyAfter = current - line.qty;
    qtyMap.set(line.productId, qtyAfter);
    if (qtyAfter < 0) {
      negativeProducts.push({ productId: line.productId, qtyAfter });
    }
    movementLines.push({
      movement_id: movement.id,
      product_id: line.productId,
      qty: line.qty
    });
  }

  const { error: lineErr } = await supabase.from("stock_movement_lines").insert(movementLines);
  if (lineErr) {
    throw new Error(lineErr.message);
  }

  for (const [productId, qtyAfter] of qtyMap) {
    const sold = stockLines.find((l) => l.productId === productId);
    if (!sold) continue;

    const { error: upsertErr } = await supabase.from("stock_levels").upsert(
      {
        organization_id: params.organizationId,
        product_id: productId,
        warehouse_id: params.warehouseId,
        qty: qtyAfter,
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id,product_id,warehouse_id" }
    );

    if (upsertErr) {
      throw new Error(upsertErr.message);
    }
  }

  return { negativeProducts };
}
