import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consignmentStockLinesFromProducts,
  type ConsignmentStockLine
} from "@/lib/inventory/consignment-receipt";

export { consignmentStockLinesFromProducts };

export async function returnConsignmentStock(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    warehouseId: string;
    returnId: string;
    returnNo: string;
    lines: ConsignmentStockLine[];
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
    const current = qtyMap.get(line.productId) ?? 0;
    if (current < line.qty) {
      throw new Error(`Stok tidak cukup untuk retur produk (${line.productId})`);
    }
  }

  const { data: movement, error: movErr } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: params.organizationId,
      warehouse_id: params.warehouseId,
      movement_type: "OUT",
      source_type: "CONSIGNMENT_RETURN",
      source_id: params.returnId,
      reference_no: params.returnNo,
      notes: params.notes || "Retur barang titip jual",
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (movErr || !movement) {
    throw new Error(movErr?.message || "Gagal buat stock movement retur titip");
  }

  const movementLines = stockLines.map((line) => ({
    movement_id: movement.id,
    product_id: line.productId,
    qty: line.qty,
    metadata: { consignment: true, return: true }
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

export async function hasConsignmentReturnVoidMovement(
  supabase: SupabaseClient,
  organizationId: string,
  returnId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("movement_type", "IN")
    .eq("source_type", "CONSIGNMENT_RETURN_VOID")
    .eq("source_id", returnId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

/** Balik stok IN saat void retur titip (barang titip kembali ke rak). */
export async function restoreConsignmentStockAfterReturnVoid(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    warehouseId: string;
    returnId: string;
    returnNo: string;
    lines: ConsignmentStockLine[];
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
      source_type: "CONSIGNMENT_RETURN_VOID",
      source_id: params.returnId,
      reference_no: params.returnNo,
      notes: params.notes || "Void retur titip",
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (movErr || !movement) {
    throw new Error(movErr?.message || "Gagal buat stock movement void retur titip");
  }

  const movementLines = stockLines.map((line) => ({
    movement_id: movement.id,
    product_id: line.productId,
    qty: line.qty,
    metadata: { consignment: true, returnVoid: true }
  }));

  const { error: lineErr } = await supabase.from("stock_movement_lines").insert(movementLines);
  if (lineErr) throw new Error(lineErr.message);

  for (const line of stockLines) {
    const current = qtyMap.get(line.productId) ?? 0;
    const qtyAfter = current + line.qty;

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
