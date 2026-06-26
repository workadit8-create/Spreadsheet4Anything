import type { SupabaseClient } from "@supabase/supabase-js";

export type StockAdjustLineInput = {
  productId: string;
  /** Saldo fisik hasil opname */
  qtyAfter: number;
};

export type StockAdjustResult = {
  movementId: string;
  adjustedCount: number;
  lines: Array<{
    productId: string;
    qtyBefore: number;
    qtyAfter: number;
    delta: number;
  }>;
};

export async function applyOutletStockOpname(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    warehouseId: string;
    outletCode: string;
    notes: string;
    lines: StockAdjustLineInput[];
    createdBy?: string | null;
  }
): Promise<StockAdjustResult> {
  const validLines = params.lines.filter((l) => l.productId && Number.isFinite(l.qtyAfter));
  if (!validLines.length) {
    throw new Error("Tidak ada baris stok untuk disimpan");
  }

  const productIds = [...new Set(validLines.map((l) => l.productId))];

  const { data: products, error: prodErr } = await supabase
    .from("products_with_inventory_policy")
    .select("id, name, effective_tracks_stock")
    .eq("organization_id", params.organizationId)
    .in("id", productIds);

  if (prodErr) throw new Error(prodErr.message);

  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const stockLines = validLines.filter((l) => {
    const p = productMap.get(l.productId);
    return p && Boolean(p.effective_tracks_stock);
  });

  if (!stockLines.length) {
    throw new Error("Tidak ada produk ber-stok pada daftar opname");
  }

  const { data: levels, error: levelErr } = await supabase
    .from("stock_levels")
    .select("product_id, qty")
    .eq("organization_id", params.organizationId)
    .eq("warehouse_id", params.warehouseId)
    .in("product_id", stockLines.map((l) => l.productId));

  if (levelErr) throw new Error(levelErr.message);

  const qtyMap = new Map((levels || []).map((r) => [r.product_id, Number(r.qty) || 0]));
  const resultLines: StockAdjustResult["lines"] = [];
  const movementLines: Array<{ product_id: string; qty: number; metadata: Record<string, unknown> }> =
    [];

  for (const line of stockLines) {
    const qtyBefore = qtyMap.get(line.productId) ?? 0;
    const qtyAfter = Number(line.qtyAfter);
    const delta = qtyAfter - qtyBefore;
    if (Math.abs(delta) < 0.0001) continue;

    resultLines.push({
      productId: line.productId,
      qtyBefore,
      qtyAfter,
      delta
    });
    movementLines.push({
      product_id: line.productId,
      qty: Math.abs(delta),
      metadata: {
        mode: "opname",
        qty_before: qtyBefore,
        qty_after: qtyAfter,
        delta
      }
    });
    qtyMap.set(line.productId, qtyAfter);
  }

  if (!resultLines.length) {
    throw new Error("Tidak ada perubahan stok — saldo sudah sesuai opname");
  }

  const referenceNo = `OPNAME-${params.outletCode}-${new Date().toISOString().slice(0, 10)}`;

  const { data: movement, error: movErr } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: params.organizationId,
      warehouse_id: params.warehouseId,
      movement_type: "ADJUST",
      source_type: "OUTLET_OPNAME",
      reference_no: referenceNo,
      notes: params.notes || `Opname outlet ${params.outletCode}`,
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (movErr || !movement) {
    throw new Error(movErr?.message || "Gagal buat mutasi stok");
  }

  const { error: lineErr } = await supabase.from("stock_movement_lines").insert(
    movementLines.map((l) => ({
      movement_id: movement.id,
      product_id: l.product_id,
      qty: l.qty,
      metadata: l.metadata
    }))
  );

  if (lineErr) throw new Error(lineErr.message);

  for (const row of resultLines) {
    const { error: upsertErr } = await supabase.from("stock_levels").upsert(
      {
        organization_id: params.organizationId,
        product_id: row.productId,
        warehouse_id: params.warehouseId,
        qty: row.qtyAfter,
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id,product_id,warehouse_id" }
    );
    if (upsertErr) throw new Error(upsertErr.message);
  }

  return {
    movementId: movement.id,
    adjustedCount: resultLines.length,
    lines: resultLines
  };
}
