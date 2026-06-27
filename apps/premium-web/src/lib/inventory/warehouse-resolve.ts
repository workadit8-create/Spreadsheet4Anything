import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";

export type WarehouseRole = "distribution" | "outlet";

export type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
  active: boolean;
  is_display: boolean;
  warehouse_role: WarehouseRole;
};

export async function isMultiWarehouseEnabled(
  supabase: SupabaseClient,
  organizationId: string
): Promise<boolean> {
  const addons = await fetchOrgAddons(supabase, organizationId);
  return isAddonEnabled(addons, "multi_warehouse");
}

export async function isMultiOutletEnabled(
  supabase: SupabaseClient,
  organizationId: string
): Promise<boolean> {
  const addons = await fetchOrgAddons(supabase, organizationId);
  return isAddonEnabled(addons, "outlet");
}

/** Gudang display untuk penjualan — multi warehouse: is_display + link outlet. */
export async function resolveDisplayWarehouseIdForOutlet(
  supabase: SupabaseClient,
  organizationId: string,
  outletId: string
): Promise<string | null> {
  const { data: links, error } = await supabase
    .from("outlet_warehouses")
    .select("warehouse_id, is_primary, warehouses!inner(id, active, is_display)")
    .eq("organization_id", organizationId)
    .eq("outlet_id", outletId);

  if (error) throw new Error(error.message);

  const candidates = (links || [])
    .map((row) => {
      const wh = row.warehouses as
        | { id: string; active: boolean; is_display: boolean }
        | { id: string; active: boolean; is_display: boolean }[]
        | null;
      const w = Array.isArray(wh) ? wh[0] : wh;
      if (!w?.id || w.active === false || w.is_display !== true) return null;
      return { id: w.id, isPrimary: row.is_primary === true };
    })
    .filter(Boolean) as Array<{ id: string; isPrimary: boolean }>;

  if (!candidates.length) return null;
  const primary = candidates.find((c) => c.isPrimary);
  return primary?.id ?? candidates[0].id;
}

/** Resolve gudang penjualan dengan awareness multi warehouse + display tag. */
export async function resolveSaleWarehouseId(
  supabase: SupabaseClient,
  organizationId: string,
  options: {
    outletCode?: string | null;
    explicitWarehouseId?: string | null;
  } = {}
): Promise<string | null> {
  const explicit = String(options.explicitWarehouseId || "").trim();
  if (explicit) return explicit;

  const multiWarehouse = await isMultiWarehouseEnabled(supabase, organizationId);
  const outletCode = String(options.outletCode || "").trim();

  if (outletCode) {
    const { data: outletRow } = await supabase
      .from("outlets")
      .select("id, warehouse_id")
      .eq("organization_id", organizationId)
      .eq("outlet_code", outletCode.toUpperCase())
      .eq("active", true)
      .maybeSingle();

    if (outletRow?.id) {
      if (multiWarehouse) {
        const displayId = await resolveDisplayWarehouseIdForOutlet(
          supabase,
          organizationId,
          outletRow.id
        );
        if (displayId) return displayId;
      }

      if (outletRow.warehouse_id) {
        if (multiWarehouse) {
          const { data: wh } = await supabase
            .from("warehouses")
            .select("id, is_display, active")
            .eq("id", outletRow.warehouse_id)
            .eq("organization_id", organizationId)
            .maybeSingle();
          if (wh?.active !== false && wh?.is_display === true) return wh.id;
        } else {
          return outletRow.warehouse_id;
        }
      }
    }
  }

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id, is_display")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("is_display", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!warehouse?.id) return null;
  if (multiWarehouse && warehouse.is_display !== true) return null;
  return warehouse.id;
}

export async function countActiveWarehouses(
  supabase: SupabaseClient,
  organizationId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("warehouses")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function syncOutletWarehouseLink(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    outletId: string;
    warehouseId: string;
    isPrimary?: boolean;
  }
): Promise<void> {
  const { error: delErr } = await supabase
    .from("outlet_warehouses")
    .delete()
    .eq("organization_id", params.organizationId)
    .eq("warehouse_id", params.warehouseId);

  if (delErr) throw new Error(delErr.message);

  const { error: insErr } = await supabase.from("outlet_warehouses").insert({
    organization_id: params.organizationId,
    outlet_id: params.outletId,
    warehouse_id: params.warehouseId,
    is_primary: params.isPrimary !== false
  });

  if (insErr) throw new Error(insErr.message);
}

export async function clearOutletWarehouseLink(
  supabase: SupabaseClient,
  organizationId: string,
  warehouseId: string
): Promise<void> {
  const { error } = await supabase
    .from("outlet_warehouses")
    .delete()
    .eq("organization_id", organizationId)
    .eq("warehouse_id", warehouseId);

  if (error) throw new Error(error.message);
}

export async function assertWarehouseOutletExclusive(
  supabase: SupabaseClient,
  organizationId: string,
  warehouseId: string,
  outletId: string | null
): Promise<string | null> {
  const { data: existing, error } = await supabase
    .from("outlet_warehouses")
    .select("outlet_id, outlets(outlet_code, name)")
    .eq("organization_id", organizationId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!existing) return null;
  if (outletId && existing.outlet_id === outletId) return null;

  const outlet = existing.outlets as
    | { outlet_code: string; name: string }
    | { outlet_code: string; name: string }[]
    | null;
  const o = Array.isArray(outlet) ? outlet[0] : outlet;
  const label = o ? `${o.outlet_code} — ${o.name}` : "outlet lain";
  return `Gudang ini sudah terhubung ke ${label}. Satu gudang hanya untuk satu outlet.`;
}
