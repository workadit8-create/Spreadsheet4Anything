import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipRole } from "@/lib/org/roles";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";
import {
  fetchUserInventoryOutletCodes,
  filterOutletOptionsByScope
} from "@/lib/outlets/membership-scope";
import { normalizeOutletCode } from "@/lib/outlets/helpers";
import { resolveProductStockDisplay } from "@/lib/inventory/product-stock-display";
import { productMatchesOutlet } from "@/lib/inventory/product-outlet-scope";
import { PRODUCT_KINDS, PRODUCT_KIND_LABELS } from "@/lib/products/inventory-policy";

export type InventoryCatalogItem = {
  id: string;
  sku: string | null;
  name: string;
  sellPrice: number;
  categoryId: string | null;
  categoryName: string;
  kindLabel: string;
  effectiveProductKind: string;
  active: boolean;
  stockQty: number | null;
  stockQtyLabel: string;
  unitLabel: string;
  stockNote?: string;
  warehouseName: string;
};

export type InventoryCatalogResult = {
  outlets: {
    enabled: boolean;
    options: Array<{ outletCode: string; label: string; name: string }>;
    locked: boolean;
  };
  selectedOutlet: { outletCode: string; name: string } | null;
  warehouse: { id: string; code: string; name: string } | null;
  categories: Array<{ id: string; code: string; name: string; productKind: string }>;
  productKinds: Array<{ value: string; label: string }>;
  items: InventoryCatalogItem[];
};

export type InventoryCatalogFilters = {
  outletCode?: string;
  categoryId?: string;
  productKind?: string;
  search?: string;
};

export async function fetchInventoryProductCatalog(
  supabase: SupabaseClient,
  orgId: string,
  role: MembershipRole,
  filters: InventoryCatalogFilters = {}
): Promise<InventoryCatalogResult> {
  const addons = await fetchOrgAddons(supabase, orgId);
  const outletAddon = isAddonEnabled(addons, "outlet");

  const outletBootstrap = outletAddon
    ? await fetchOutletBootstrap(supabase, orgId)
    : { enabled: false, options: [] as { outletCode: string; label: string; name: string }[] };

  const allowedCodes = outletAddon
    ? await fetchUserInventoryOutletCodes(supabase, orgId, role)
    : null;
  const scopedOptions = filterOutletOptionsByScope(
    outletBootstrap.options.map((o) => ({
      outletCode: o.outletCode,
      label: o.label,
      name: o.name
    })),
    allowedCodes
  );

  const locked = Boolean(allowedCodes && allowedCodes.length === 1);
  let outletCode = filters.outletCode
    ? normalizeOutletCode(filters.outletCode)
    : locked && scopedOptions[0]
      ? scopedOptions[0].outletCode
      : "";

  if (!outletCode && scopedOptions.length === 1) {
    outletCode = scopedOptions[0].outletCode;
  }
  if (!outletCode && scopedOptions.length > 1 && !filters.outletCode) {
    outletCode = scopedOptions[0].outletCode;
  }

  if (outletCode && allowedCodes && !allowedCodes.includes(outletCode)) {
    throw new Error(`Anda tidak punya akses outlet ${outletCode}`);
  }

  let warehouse: { id: string; code: string; name: string } | null = null;
  let selectedOutlet: { outletCode: string; name: string } | null = null;

  if (outletCode && outletAddon) {
    const { data: outletRow } = await supabase
      .from("outlets")
      .select("outlet_code, name, warehouse_id")
      .eq("organization_id", orgId)
      .eq("outlet_code", outletCode)
      .eq("active", true)
      .maybeSingle();

    if (outletRow?.warehouse_id) {
      selectedOutlet = { outletCode: outletRow.outlet_code, name: outletRow.name };
      const { data: wh } = await supabase
        .from("warehouses")
        .select("id, code, name")
        .eq("id", outletRow.warehouse_id)
        .maybeSingle();
      if (wh) warehouse = wh;
    }
  }

  if (!warehouse) {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (wh) warehouse = wh;
  }

  const [{ data: categories }, { data: units }, { data: conversions }, { data: recipes }] =
    await Promise.all([
      supabase
        .from("product_categories")
        .select("id, code, name, product_kind")
        .eq("organization_id", orgId)
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase.from("units").select("id, code, name").eq("organization_id", orgId),
      supabase
        .from("unit_conversions")
        .select("from_unit_id, to_unit_id, factor")
        .eq("organization_id", orgId),
      supabase
        .from("product_recipes")
        .select("product_id")
        .eq("organization_id", orgId)
        .eq("active", true)
    ]);

  const unitById = new Map((units || []).map((u) => [u.id, u]));
  const bomProductIds = new Set((recipes || []).map((r) => r.product_id as string));
  const conversionMap = new Map<string, number>();
  for (const c of conversions || []) {
    conversionMap.set(`${c.from_unit_id}:${c.to_unit_id}`, Number(c.factor) || 0);
  }

  let productQuery = supabase
    .from("products_with_inventory_policy")
    .select(
      "id, sku, name, sell_price, category_id, category_name, tracks_stock, product_kind, category_tracks_stock, category_product_kind, category_uses_recipe, effective_tracks_stock, effective_product_kind, active, metadata, unit_id, units(code, name)"
    )
    .eq("organization_id", orgId)
    .order("name");

  if (filters.categoryId) {
    productQuery = productQuery.eq("category_id", filters.categoryId);
  }
  if (filters.productKind) {
    productQuery = productQuery.eq("effective_product_kind", filters.productKind);
  }

  const { data: productRows, error: prodErr } = await productQuery;
  if (prodErr) throw new Error(prodErr.message);

  const search = (filters.search || "").trim().toLowerCase();
  const scopeByOutlet = outletAddon && Boolean(outletCode);
  const filteredRows = (productRows || []).filter((p) => {
    if (scopeByOutlet && !productMatchesOutlet(p.metadata as Record<string, unknown>, outletCode)) {
      return false;
    }
    if (!search) return true;
    const hay = `${p.sku || ""} ${p.name} ${p.category_name || ""}`.toLowerCase();
    return hay.includes(search);
  });

  const productIds = filteredRows.map((p) => p.id);
  let stockMap = new Map<string, number>();
  if (warehouse?.id && productIds.length) {
    const { data: levels } = await supabase
      .from("stock_levels")
      .select("product_id, qty")
      .eq("organization_id", orgId)
      .eq("warehouse_id", warehouse.id)
      .in("product_id", productIds);
    stockMap = new Map((levels || []).map((l) => [l.product_id, Number(l.qty) || 0]));
  }

  const warehouseName = warehouse?.name || "—";

  const items: InventoryCatalogItem[] = filteredRows.map((p) => {
    const rawUnit = p.units as { code: string; name: string } | { code: string; name: string }[] | null;
    const unit = Array.isArray(rawUnit) ? rawUnit[0] : rawUnit;
    const unitCode = unit?.code || "PCS";
    const meta = (p.metadata || {}) as Record<string, unknown>;
    const purchaseUnitId = String(meta.purchase_unit_id || "").trim() || p.unit_id;
    const purchaseUnit = purchaseUnitId ? unitById.get(purchaseUnitId) : null;
    const purchaseCode = purchaseUnit?.code || unitCode;
    const stockUnitId = p.unit_id as string | null;
    const conversionFactor =
      purchaseUnitId && stockUnitId && purchaseUnitId !== stockUnitId
        ? conversionMap.get(`${purchaseUnitId}:${stockUnitId}`) ?? null
        : null;

    const stock = resolveProductStockDisplay({
      productKind: p.product_kind,
      categoryKind: p.category_product_kind,
      tracksStock: p.tracks_stock,
      categoryTracksStock: p.category_tracks_stock,
      categoryUsesRecipe: Boolean(p.category_uses_recipe),
      hasActiveBom: bomProductIds.has(p.id),
      qty: stockMap.get(p.id) ?? 0,
      unitCode,
      purchaseUnitCode: purchaseCode,
      conversionFactor
    });

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      sellPrice: Number(p.sell_price) || 0,
      categoryId: p.category_id,
      categoryName: p.category_name || "—",
      kindLabel: stock.kindLabel,
      effectiveProductKind: String(p.effective_product_kind || stock.kind),
      active: p.active !== false,
      stockQty: stock.qty,
      stockQtyLabel: stock.qtyLabel,
      unitLabel: stock.unitLabel,
      stockNote: stock.note,
      warehouseName
    };
  });

  return {
    outlets: {
      enabled: outletAddon,
      options: scopedOptions,
      locked
    },
    selectedOutlet,
    warehouse,
    categories: (categories || []).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      productKind: c.product_kind
    })),
    productKinds: PRODUCT_KINDS.map((k) => ({ value: k, label: PRODUCT_KIND_LABELS[k] })),
    items
  };
}
