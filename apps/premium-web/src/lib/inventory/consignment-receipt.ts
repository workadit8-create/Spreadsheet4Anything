import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";
import {
  consignmentSettlementPriceFromMetadata,
  isConsignmentProduct
} from "@/lib/products/consignment-policy";

export type ConsignmentStockLine = {
  productId: string;
  qty: number;
  unitSettlement: number;
  tracksStock: boolean;
};

export async function receiveConsignmentStock(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    warehouseId: string;
    receiptId: string;
    receiptNo: string;
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
      source_type: "CONSIGNMENT_RECEIPT",
      source_id: params.receiptId,
      reference_no: params.receiptNo,
      notes: params.notes || "Penerimaan titip jual",
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (movErr || !movement) {
    throw new Error(movErr?.message || "Gagal buat stock movement titip jual");
  }

  const movementLines = stockLines.map((line) => ({
    movement_id: movement.id,
    product_id: line.productId,
    qty: line.qty,
    unit_cost: line.unitSettlement,
    metadata: { consignment: true }
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

export async function consignmentStockLinesFromProducts(
  supabase: SupabaseClient,
  organizationId: string,
  supplierId: string,
  lines: Array<{ product_id: string; qty: number; unit_settlement?: number }>
): Promise<ConsignmentStockLine[]> {
  const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))];
  if (!productIds.length) return [];

  const { data: products, error } = await supabase
    .from("products_with_inventory_policy")
    .select("id, metadata, tracks_stock, category_tracks_stock")
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (error) throw new Error(error.message);

  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const result: ConsignmentStockLine[] = [];

  for (const line of lines) {
    if (!line.product_id || line.qty <= 0) continue;
    const product = productMap.get(line.product_id);
    if (!product) throw new Error(`Produk tidak ditemukan: ${line.product_id}`);

    const meta = (product.metadata || {}) as Record<string, unknown>;
    if (!isConsignmentProduct(meta)) {
      throw new Error(`Produk bukan titip jual — tidak bisa diterima via modul titip`);
    }
    const productSupplier = String(meta.consignmentSupplierId || "");
    if (productSupplier !== supplierId) {
      throw new Error("Pemilik titip produk tidak sesuai supplier dokumen");
    }

    const tracks = effectiveTracksStock(product.tracks_stock, product.category_tracks_stock);
    const unitSettlement =
      line.unit_settlement != null && line.unit_settlement >= 0
        ? Math.round(line.unit_settlement)
        : consignmentSettlementPriceFromMetadata(meta) ?? 0;

    result.push({
      productId: line.product_id,
      qty: line.qty,
      unitSettlement,
      tracksStock: tracks
    });
  }

  return result;
}
