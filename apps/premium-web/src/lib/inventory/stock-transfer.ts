import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";

export type StockTransferLineInput = {
  productId: string;
  qty: number;
};

export type StockTransferValidation = {
  outletCode: string | null;
  fromWarehouse: { id: string; code: string; name: string; warehouse_role: string };
  toWarehouse: { id: string; code: string; name: string; warehouse_role: string };
};

async function fetchWarehouseOutletIds(
  supabase: SupabaseClient,
  organizationId: string,
  warehouseId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("outlet_warehouses")
    .select("outlet_id")
    .eq("organization_id", organizationId)
    .eq("warehouse_id", warehouseId);

  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.outlet_id as string);
}

export async function validateStockTransferWarehouses(
  supabase: SupabaseClient,
  organizationId: string,
  fromWarehouseId: string,
  toWarehouseId: string
): Promise<StockTransferValidation> {
  if (fromWarehouseId === toWarehouseId) {
    throw new Error("Gudang asal dan tujuan harus berbeda");
  }

  const { data: warehouses, error } = await supabase
    .from("warehouses")
    .select("id, code, name, warehouse_role, active")
    .eq("organization_id", organizationId)
    .in("id", [fromWarehouseId, toWarehouseId]);

  if (error) throw new Error(error.message);

  const fromWh = warehouses?.find((w) => w.id === fromWarehouseId);
  const toWh = warehouses?.find((w) => w.id === toWarehouseId);

  if (!fromWh || !toWh) throw new Error("Gudang tidak ditemukan");
  if (fromWh.active === false || toWh.active === false) {
    throw new Error("Gudang nonaktif tidak bisa dipakai transfer");
  }

  const [fromOutletIds, toOutletIds] = await Promise.all([
    fetchWarehouseOutletIds(supabase, organizationId, fromWarehouseId),
    fetchWarehouseOutletIds(supabase, organizationId, toWarehouseId)
  ]);

  let outletCode: string | null = null;

  if (fromWh.warehouse_role === "distribution") {
    if (toWh.warehouse_role !== "outlet" || !toOutletIds.length) {
      throw new Error("Dari gudang distribusi hanya boleh ke gudang outlet cabang");
    }
  } else if (toWh.warehouse_role === "distribution") {
    if (fromWh.warehouse_role !== "outlet" || !fromOutletIds.length) {
      throw new Error("Ke gudang distribusi hanya dari gudang outlet cabang");
    }
  } else if (fromOutletIds.length && toOutletIds.length) {
    const shared = toOutletIds.find((id) => fromOutletIds.includes(id));
    if (!shared) {
      throw new Error(
        "Transfer antar outlet tidak diizinkan — gunakan pembelian antar outlet"
      );
    }
  }

  const anchorOutletId = toOutletIds[0] || fromOutletIds[0] || null;
  if (anchorOutletId) {
    const { data: outlet } = await supabase
      .from("outlets")
      .select("outlet_code")
      .eq("id", anchorOutletId)
      .maybeSingle();
    outletCode = outlet?.outlet_code ?? null;
  }

  return {
    outletCode,
    fromWarehouse: {
      id: fromWh.id,
      code: fromWh.code,
      name: fromWh.name,
      warehouse_role: fromWh.warehouse_role
    },
    toWarehouse: {
      id: toWh.id,
      code: toWh.code,
      name: toWh.name,
      warehouse_role: toWh.warehouse_role
    }
  };
}

export async function executeStockTransfer(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    transferId: string;
    transferNo: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    lines: StockTransferLineInput[];
    createdBy?: string | null;
    notes?: string;
  }
): Promise<{ lineCount: number }> {
  const productIds = [...new Set(params.lines.map((l) => l.productId))];
  if (!productIds.length) throw new Error("Minimal satu baris produk");

  const { data: products, error: prodErr } = await supabase
    .from("products_with_inventory_policy")
    .select("id, tracks_stock, category_tracks_stock")
    .eq("organization_id", params.organizationId)
    .in("id", productIds);

  if (prodErr) throw new Error(prodErr.message);

  const trackMap = new Map(
    (products || []).map((p) => [
      p.id,
      effectiveTracksStock(p.tracks_stock, p.category_tracks_stock)
    ])
  );

  const stockLines = params.lines
    .filter((l) => l.productId && l.qty > 0 && trackMap.get(l.productId) === true)
    .map((l) => ({ productId: l.productId, qty: l.qty }));

  if (!stockLines.length) {
    throw new Error("Tidak ada produk ber-stok pada baris transfer");
  }

  const { data: fromLevels, error: fromErr } = await supabase
    .from("stock_levels")
    .select("product_id, qty")
    .eq("organization_id", params.organizationId)
    .eq("warehouse_id", params.fromWarehouseId)
    .in("product_id", stockLines.map((l) => l.productId));

  if (fromErr) throw new Error(fromErr.message);

  const fromQtyMap = new Map((fromLevels || []).map((r) => [r.product_id, Number(r.qty) || 0]));

  for (const line of stockLines) {
    const available = fromQtyMap.get(line.productId) ?? 0;
    if (available < line.qty) {
      throw new Error(`Stok gudang asal tidak cukup untuk salah satu produk (tersedia ${available})`);
    }
  }

  const { data: toLevels, error: toErr } = await supabase
    .from("stock_levels")
    .select("product_id, qty")
    .eq("organization_id", params.organizationId)
    .eq("warehouse_id", params.toWarehouseId)
    .in("product_id", stockLines.map((l) => l.productId));

  if (toErr) throw new Error(toErr.message);

  const toQtyMap = new Map((toLevels || []).map((r) => [r.product_id, Number(r.qty) || 0]));

  const { data: outMovement, error: outMovErr } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: params.organizationId,
      warehouse_id: params.fromWarehouseId,
      movement_type: "OUT",
      source_type: "STOCK_TRANSFER",
      source_id: params.transferId,
      reference_no: params.transferNo,
      notes: params.notes || "Transfer stok keluar",
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (outMovErr || !outMovement) {
    throw new Error(outMovErr?.message || "Gagal buat mutasi stok keluar");
  }

  const { data: inMovement, error: inMovErr } = await supabase
    .from("stock_movements")
    .insert({
      organization_id: params.organizationId,
      warehouse_id: params.toWarehouseId,
      movement_type: "IN",
      source_type: "STOCK_TRANSFER",
      source_id: params.transferId,
      reference_no: params.transferNo,
      notes: params.notes || "Transfer stok masuk",
      created_by: params.createdBy ?? null
    })
    .select("id")
    .single();

  if (inMovErr || !inMovement) {
    throw new Error(inMovErr?.message || "Gagal buat mutasi stok masuk");
  }

  const outLines = stockLines.map((l) => ({
    movement_id: outMovement.id,
    product_id: l.productId,
    qty: l.qty,
    metadata: { direction: "OUT", to_warehouse_id: params.toWarehouseId }
  }));

  const inLines = stockLines.map((l) => ({
    movement_id: inMovement.id,
    product_id: l.productId,
    qty: l.qty,
    metadata: { direction: "IN", from_warehouse_id: params.fromWarehouseId }
  }));

  const { error: outLineErr } = await supabase.from("stock_movement_lines").insert(outLines);
  if (outLineErr) throw new Error(outLineErr.message);

  const { error: inLineErr } = await supabase.from("stock_movement_lines").insert(inLines);
  if (inLineErr) throw new Error(inLineErr.message);

  for (const line of stockLines) {
    const fromAfter = (fromQtyMap.get(line.productId) ?? 0) - line.qty;
    const toAfter = (toQtyMap.get(line.productId) ?? 0) + line.qty;

    const { error: fromUpsertErr } = await supabase.from("stock_levels").upsert(
      {
        organization_id: params.organizationId,
        product_id: line.productId,
        warehouse_id: params.fromWarehouseId,
        qty: fromAfter,
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id,product_id,warehouse_id" }
    );
    if (fromUpsertErr) throw new Error(fromUpsertErr.message);

    const { error: toUpsertErr } = await supabase.from("stock_levels").upsert(
      {
        organization_id: params.organizationId,
        product_id: line.productId,
        warehouse_id: params.toWarehouseId,
        qty: toAfter,
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id,product_id,warehouse_id" }
    );
    if (toUpsertErr) throw new Error(toUpsertErr.message);
  }

  return { lineCount: stockLines.length };
}
