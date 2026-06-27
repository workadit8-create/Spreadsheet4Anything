import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";
import { mergeProductMetadata } from "@/lib/products/ppn";

export type PurchaseStockLine = {
  productId: string;
  qty: number;
  tracksStock: boolean;
  unitHpp?: number | null;
};

export async function purchaseStockLinesFromProducts(
  supabase: SupabaseClient,
  organizationId: string,
  lines: Array<{ product_id: string; qty: number }>
): Promise<PurchaseStockLine[]> {
  const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))];
  if (!productIds.length) return [];

  const { data: products, error } = await supabase
    .from("products_with_inventory_policy")
    .select("id, tracks_stock, category_tracks_stock")
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (error) throw new Error(error.message);

  const trackMap = new Map(
    (products || []).map((p) => [
      p.id,
      effectiveTracksStock(p.tracks_stock, p.category_tracks_stock)
    ])
  );

  return lines
    .filter((l) => l.product_id && l.qty > 0)
    .map((l) => ({
      productId: l.product_id,
      qty: l.qty,
      tracksStock: trackMap.get(l.product_id) === true
    }));
}

export async function hasPurchaseStockInMovement(
  supabase: SupabaseClient,
  organizationId: string,
  purchaseOrderId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("movement_type", "IN")
    .eq("source_type", "PURCHASE_ORDER")
    .eq("source_id", purchaseOrderId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

export async function hasPurchaseStockVoidMovement(
  supabase: SupabaseClient,
  organizationId: string,
  purchaseOrderId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("movement_type", "OUT")
    .eq("source_type", "PURCHASE_ORDER_VOID")
    .eq("source_id", purchaseOrderId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

export async function receivePurchaseStock(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    warehouseId: string;
    purchaseOrderId: string;
    poNo: string;
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

  const { data: movement, error: movErr } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: params.organizationId,
      warehouse_id: params.warehouseId,
      movement_type: "IN",
      source_type: "PURCHASE_ORDER",
      source_id: params.purchaseOrderId,
      reference_no: params.poNo,
      notes: params.notes || "Pembelian",
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (movErr || !movement) {
    throw new Error(movErr?.message || "Gagal buat stock movement IN");
  }

  const movementLines = stockLines.map((line) => ({
    movement_id: movement.id,
    product_id: line.productId,
    qty: line.qty,
    unit_cost: line.unitHpp != null ? line.unitHpp : null
  }));

  const { error: lineErr } = await supabase.from("stock_movement_lines").insert(movementLines);
  if (lineErr) throw new Error(lineErr.message);

  for (const line of stockLines) {
    const current = qtyMap.get(line.productId) ?? 0;
    const qtyAfter = current + line.qty;
    qtyMap.set(line.productId, qtyAfter);

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

export async function reversePurchaseStock(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    warehouseId: string;
    purchaseOrderId: string;
    poNo: string;
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

  const { data: movement, error: movErr } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: params.organizationId,
      warehouse_id: params.warehouseId,
      movement_type: "OUT",
      source_type: "PURCHASE_ORDER_VOID",
      source_id: params.purchaseOrderId,
      reference_no: params.poNo,
      notes: params.notes || "Void pembelian",
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (movErr || !movement) {
    throw new Error(movErr?.message || "Gagal buat stock movement void");
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

export function unitHppFromPurchaseLine(
  dpp: number | null | undefined,
  qty: number,
  unitCost: number,
  diskon: number
): number {
  const q = Number(qty) || 0;
  if (q <= 0) return 0;
  if (dpp != null && dpp > 0) return Math.max(0, Math.round(dpp / q));
  const net = Math.max(0, q * (Number(unitCost) || 0) - (Number(diskon) || 0));
  return Math.max(0, Math.round(net / q));
}

export async function updateProductHppFromPurchaseLines(
  supabase: SupabaseClient,
  organizationId: string,
  lines: Array<{
    product_id: string | null;
    qty: number;
    unit_cost: number;
    metadata?: Record<string, unknown> | null;
  }>
): Promise<number> {
  let updated = 0;
  for (const line of lines) {
    if (!line.product_id) continue;
    const meta = (line.metadata || {}) as Record<string, unknown>;
    const hpp = unitHppFromPurchaseLine(
      meta.dpp != null ? Number(meta.dpp) : null,
      line.qty,
      line.unit_cost,
      Number(meta.diskon) || 0
    );
    if (hpp <= 0) continue;

    const { data: product } = await supabase
      .from("products")
      .select("metadata")
      .eq("id", line.product_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!product) continue;

    const newMeta = mergeProductMetadata((product.metadata || {}) as Record<string, unknown>, {
      hpp
    });

    const { error } = await supabase
      .from("products")
      .update({ metadata: newMeta, updated_at: new Date().toISOString() })
      .eq("id", line.product_id)
      .eq("organization_id", organizationId);

    if (!error) updated += 1;
  }
  return updated;
}

export function isInventoryPurchaseOrder(metadata: Record<string, unknown> | null | undefined): boolean {
  return String((metadata || {}).pembelianMode || "") === "inventory";
}
