import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipRole } from "@/lib/org/roles";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";
import {
  fetchUserInventoryOutletCodes,
  filterOutletOptionsByScope
} from "@/lib/outlets/membership-scope";
import { normalizeOutletCode } from "@/lib/outlets/helpers";

export type OutletStockProduct = {
  id: string;
  sku: string | null;
  name: string;
  unitCode: string;
  unitName: string;
  tracksStock: boolean;
  stockQty: number;
};

export async function fetchOutletInventoryBootstrap(
  supabase: SupabaseClient,
  orgId: string,
  role: MembershipRole,
  outletCodeFilter?: string
) {
  const outletBootstrap = await fetchOutletBootstrap(supabase, orgId);
  if (!outletBootstrap.enabled) {
    return {
      enabled: false,
      outlets: { enabled: false, options: [] },
      inventoryScope: { restricted: false, locked: false, outletCodes: [] },
      outlet: null as null,
      warehouse: null as null,
      products: [] as OutletStockProduct[]
    };
  }

  const allowedCodes = await fetchUserInventoryOutletCodes(supabase, orgId, role);
  const scopedOptions = filterOutletOptionsByScope(outletBootstrap.options, allowedCodes);

  if (role === "outlet_staff" && (!allowedCodes || !allowedCodes.length)) {
    throw new Error("Akun stok outlet belum ditetapkan ke outlet. Hubungi owner.");
  }

  const outletCode = outletCodeFilter
    ? normalizeOutletCode(outletCodeFilter)
    : scopedOptions.length === 1
      ? scopedOptions[0].outletCode
      : "";

  let outletRow: {
    outlet_code: string;
    name: string;
    warehouse_id: string | null;
  } | null = null;

  if (outletCode) {
    if (allowedCodes && !allowedCodes.includes(outletCode)) {
      throw new Error(`Anda tidak punya akses stok outlet ${outletCode}`);
    }

    const { data, error } = await supabase
      .from("outlets")
      .select("outlet_code, name, warehouse_id")
      .eq("organization_id", orgId)
      .eq("outlet_code", outletCode)
      .eq("active", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.warehouse_id) {
      throw new Error(`Outlet ${outletCode} belum punya gudang`);
    }
    outletRow = data;
  }

  let products: OutletStockProduct[] = [];
  let warehouse: { id: string; code: string; name: string } | null = null;

  if (outletRow?.warehouse_id) {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("id", outletRow.warehouse_id)
      .maybeSingle();

    if (wh) warehouse = wh;

    const { data: productRows, error: prodErr } = await supabase
      .from("products_with_inventory_policy")
      .select(
        "id, sku, name, effective_tracks_stock, units(code, name)"
      )
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
        .eq("warehouse_id", outletRow.warehouse_id)
        .in("product_id", productIds);

      stockMap = new Map((levels || []).map((l) => [l.product_id, Number(l.qty) || 0]));
    }

    products = (productRows || []).map((p) => {
      const rawUnit = p.units as { code: string; name: string } | { code: string; name: string }[] | null;
      const unit = Array.isArray(rawUnit) ? rawUnit[0] : rawUnit;
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        unitCode: unit?.code || "PCS",
        unitName: unit?.name || unit?.code || "PCS",
        tracksStock: true,
        stockQty: stockMap.get(p.id) ?? 0
      };
    });
  }

  const inventoryScope = {
    restricted: allowedCodes !== null,
    locked: Boolean(allowedCodes && allowedCodes.length === 1),
    outletCodes: allowedCodes || []
  };

  return {
    enabled: true,
    outlets: {
      enabled: true,
      options: scopedOptions
    },
    inventoryScope,
    outlet: outletRow
      ? { outletCode: outletRow.outlet_code, name: outletRow.name }
      : null,
    warehouse,
    products
  };
}
