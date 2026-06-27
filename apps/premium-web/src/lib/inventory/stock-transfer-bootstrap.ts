import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";
import {
  fetchUserInventoryOutletCodes,
  filterOutletOptionsByScope
} from "@/lib/outlets/membership-scope";
import type { MembershipRole } from "@/lib/org/roles";

export type TransferWarehouseOption = {
  id: string;
  code: string;
  name: string;
  warehouseRole: string;
  isDisplay: boolean;
  outletCodes: string[];
};

export type TransferProductOption = {
  id: string;
  sku: string | null;
  name: string;
  stockQty: number;
};

export async function fetchStockTransferBootstrap(
  supabase: SupabaseClient,
  orgId: string,
  role: MembershipRole,
  fromWarehouseId?: string
) {
  const addons = await fetchOrgAddons(supabase, orgId);
  if (!isAddonEnabled(addons, "inventory") || !isAddonEnabled(addons, "multi_warehouse")) {
    throw new Error("Add-on Multi Warehouse tidak aktif");
  }

  const outletBootstrap = await fetchOutletBootstrap(supabase, orgId);
  const allowedCodes = await fetchUserInventoryOutletCodes(supabase, orgId, role);
  const scopedOptions = filterOutletOptionsByScope(outletBootstrap.options, allowedCodes);

  const { data: warehouses, error: whErr } = await supabase
    .from("warehouses")
    .select("id, code, name, warehouse_role, is_display, active")
    .eq("organization_id", orgId)
    .eq("active", true)
    .order("name");

  if (whErr) throw new Error(whErr.message);

  const { data: links } = await supabase
    .from("outlet_warehouses")
    .select("warehouse_id, outlets(outlet_code)")
    .eq("organization_id", orgId);

  const outletCodesByWarehouse = new Map<string, string[]>();
  for (const link of links || []) {
    const outlet = link.outlets as { outlet_code: string } | { outlet_code: string }[] | null;
    const code = Array.isArray(outlet) ? outlet[0]?.outlet_code : outlet?.outlet_code;
    if (!code) continue;
    const list = outletCodesByWarehouse.get(link.warehouse_id) || [];
    list.push(code);
    outletCodesByWarehouse.set(link.warehouse_id, list);
  }

  const warehouseOptions: TransferWarehouseOption[] = (warehouses || []).map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    warehouseRole: w.warehouse_role,
    isDisplay: w.is_display === true,
    outletCodes: outletCodesByWarehouse.get(w.id) || []
  }));

  let products: TransferProductOption[] = [];

  if (fromWarehouseId) {
    const { data: productRows, error: prodErr } = await supabase
      .from("products_with_inventory_policy")
      .select("id, sku, name")
      .eq("organization_id", orgId)
      .eq("active", true)
      .eq("effective_tracks_stock", true)
      .order("name");

    if (prodErr) throw new Error(prodErr.message);

    const productIds = (productRows || []).map((p) => p.id);
    let stockMap = new Map<string, number>();

    if (productIds.length) {
      const { data: levels } = await supabase
        .from("stock_levels")
        .select("product_id, qty")
        .eq("organization_id", orgId)
        .eq("warehouse_id", fromWarehouseId)
        .in("product_id", productIds);

      stockMap = new Map((levels || []).map((l) => [l.product_id, Number(l.qty) || 0]));
    }

    products = (productRows || [])
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        stockQty: stockMap.get(p.id) ?? 0
      }))
      .filter((p) => p.stockQty > 0);
  }

  return {
    outlets: scopedOptions,
    warehouses: warehouseOptions,
    products,
    multiOutlet: isAddonEnabled(addons, "outlet")
  };
}
