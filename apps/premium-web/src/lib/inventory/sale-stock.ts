import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import {
  deductSaleStock,
  type DeductSaleStockResult,
  type SaleStockLine
} from "@/lib/inventory/deduct-sale-stock";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";
import { resolveSaleWarehouseId } from "@/lib/inventory/warehouse-resolve";

export async function isInventoryStockEnabled(
  supabase: SupabaseClient,
  organizationId: string
): Promise<boolean> {
  const addons = await fetchOrgAddons(supabase, organizationId);
  return isAddonEnabled(addons, "inventory");
}

/** Resolve gudang penjualan: explicit → outlet display → default org. */
export async function resolveWarehouseIdForSale(
  supabase: SupabaseClient,
  organizationId: string,
  options: {
    outletCode?: string | null;
    explicitWarehouseId?: string | null;
  } = {}
): Promise<string | null> {
  return resolveSaleWarehouseId(supabase, organizationId, options);
}

export async function saleStockLinesFromProducts(
  supabase: SupabaseClient,
  organizationId: string,
  lines: Array<{ product_id: string; qty: number }>
): Promise<SaleStockLine[]> {
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

export async function hasSaleStockMovement(
  supabase: SupabaseClient,
  organizationId: string,
  salesOrderId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("source_type", "SALES_ORDER")
    .eq("source_id", salesOrderId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

/**
 * Kurangi stok penjualan jika add-on inventory aktif.
 * Returns null jika addon off, tidak ada gudang, atau sudah pernah dikurangi (idempotent).
 */
export async function deductSaleStockForOrderIfEnabled(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    warehouseId: string | null;
    salesOrderId: string;
    orderNo: string;
    lines: Array<{ product_id: string; qty: number }>;
    createdBy?: string | null;
    notes?: string;
    skipIfExists?: boolean;
  }
): Promise<DeductSaleStockResult | null> {
  const enabled = await isInventoryStockEnabled(supabase, params.organizationId);
  if (!enabled) return null;

  if (!params.warehouseId) {
    throw new Error("Gudang belum dikonfigurasi — tidak bisa kurangi stok");
  }

  if (params.skipIfExists) {
    const exists = await hasSaleStockMovement(
      supabase,
      params.organizationId,
      params.salesOrderId
    );
    if (exists) return null;
  }

  const stockLines = await saleStockLinesFromProducts(
    supabase,
    params.organizationId,
    params.lines
  );

  return deductSaleStock(supabase, {
    organizationId: params.organizationId,
    warehouseId: params.warehouseId,
    salesOrderId: params.salesOrderId,
    orderNo: params.orderNo,
    lines: stockLines,
    createdBy: params.createdBy,
    notes: params.notes
  });
}
