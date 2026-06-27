import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";

export type WarehouseRole = "distribution" | "outlet";

export type OutletWarehouseOption = {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
  isDisplay: boolean;
  warehouseRole: WarehouseRole;
};

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

/** Semua gudang terhubung ke satu outlet (termasuk display). */
export async function fetchOutletWarehouseOptions(
  supabase: SupabaseClient,
  organizationId: string,
  outletId: string,
  fallbackWarehouseId: string | null
): Promise<OutletWarehouseOption[]> {
  const { data: links, error } = await supabase
    .from("outlet_warehouses")
    .select(
      "warehouse_id, is_primary, warehouses(id, code, name, active, is_display, warehouse_role)"
    )
    .eq("organization_id", organizationId)
    .eq("outlet_id", outletId);

  if (error) throw new Error(error.message);

  const options: OutletWarehouseOption[] = [];
  const seen = new Set<string>();

  for (const link of links || []) {
    const wh = link.warehouses as
      | {
          id: string;
          code: string;
          name: string;
          active: boolean;
          is_display: boolean;
          warehouse_role: WarehouseRole;
        }
      | Array<{
          id: string;
          code: string;
          name: string;
          active: boolean;
          is_display: boolean;
          warehouse_role: WarehouseRole;
        }>
      | null;
    const w = Array.isArray(wh) ? wh[0] : wh;
    if (!w?.id || w.active === false || seen.has(w.id)) continue;
    seen.add(w.id);
    options.push({
      id: w.id,
      code: w.code,
      name: w.name,
      isPrimary: link.is_primary === true,
      isDisplay: w.is_display === true,
      warehouseRole: w.warehouse_role === "distribution" ? "distribution" : "outlet"
    });
  }

  if (!options.length && fallbackWarehouseId) {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("id, code, name, active, is_display, warehouse_role")
      .eq("id", fallbackWarehouseId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (wh && wh.active !== false) {
      options.push({
        id: wh.id,
        code: wh.code,
        name: wh.name,
        isPrimary: true,
        isDisplay: wh.is_display === true,
        warehouseRole: wh.warehouse_role === "distribution" ? "distribution" : "outlet"
      });
    }
  }

  return options.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Gudang penerima PO / inbound — bukan display saat multi warehouse aktif. */
export async function fetchReceivingWarehouseOptions(
  supabase: SupabaseClient,
  organizationId: string,
  outletCode: string | null
): Promise<OutletWarehouseOption[]> {
  const multiWarehouse = await isMultiWarehouseEnabled(supabase, organizationId);

  const { data: distributionRows } = await supabase
    .from("warehouses")
    .select("id, code, name, is_display, warehouse_role, active")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .eq("warehouse_role", "distribution")
    .order("name");

  const distribution = (distributionRows || []).map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    isPrimary: false,
    isDisplay: w.is_display === true,
    warehouseRole: "distribution" as WarehouseRole
  }));

  if (!outletCode) {
    if (multiWarehouse) return distribution;
    const { data: wh } = await supabase
      .from("warehouses")
      .select("id, code, name, is_display, warehouse_role")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!wh) return [];
    return [
      {
        id: wh.id,
        code: wh.code,
        name: wh.name,
        isPrimary: true,
        isDisplay: wh.is_display === true,
        warehouseRole: wh.warehouse_role === "distribution" ? "distribution" : "outlet"
      }
    ];
  }

  const { data: outletRow } = await supabase
    .from("outlets")
    .select("id, warehouse_id")
    .eq("organization_id", organizationId)
    .eq("outlet_code", outletCode.toUpperCase())
    .eq("active", true)
    .maybeSingle();

  if (!outletRow) return distribution;

  const linked = await fetchOutletWarehouseOptions(
    supabase,
    organizationId,
    outletRow.id,
    outletRow.warehouse_id
  );

  if (!multiWarehouse) {
    return linked.length ? linked : distribution;
  }

  const linkedReceiving = linked.filter((w) => !w.isDisplay);
  const seen = new Set<string>();
  const merged: OutletWarehouseOption[] = [];

  for (const w of [...distribution, ...linkedReceiving]) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    merged.push(w);
  }

  return merged;
}

export async function assertReceivingWarehouseAllowed(
  supabase: SupabaseClient,
  organizationId: string,
  warehouseId: string,
  outletCode: string | null
): Promise<void> {
  const multiWarehouse = await isMultiWarehouseEnabled(supabase, organizationId);
  const options = await fetchReceivingWarehouseOptions(supabase, organizationId, outletCode);
  const picked = options.find((w) => w.id === warehouseId);

  if (!picked) {
    throw new Error("Gudang penerima tidak valid untuk outlet ini");
  }

  if (multiWarehouse && picked.isDisplay) {
    throw new Error("Stok pembelian tidak boleh masuk gudang display — pilih gudang inbound/distribusi");
  }
}

/** Resolve gudang penerima stok (PO, penerimaan titip) — aman saat add-on multi warehouse off. */
export async function resolveReceivingWarehouseId(
  supabase: SupabaseClient,
  organizationId: string,
  options: {
    outletCode?: string | null;
    explicitWarehouseId?: string | null;
  } = {}
): Promise<string | null> {
  const explicit = String(options.explicitWarehouseId || "").trim();
  const outletCode = String(options.outletCode || "").trim() || null;

  if (explicit) {
    await assertReceivingWarehouseAllowed(supabase, organizationId, explicit, outletCode);
    return explicit;
  }

  const receivingOptions = await fetchReceivingWarehouseOptions(
    supabase,
    organizationId,
    outletCode
  );

  if (!receivingOptions.length) return null;

  const multiWarehouse = await isMultiWarehouseEnabled(supabase, organizationId);
  if (multiWarehouse) {
    const inbound = receivingOptions.find((w) => !w.isDisplay);
    return inbound?.id ?? receivingOptions[0].id;
  }

  const primary = receivingOptions.find((w) => w.isPrimary);
  return primary?.id ?? receivingOptions[0].id;
}

/** Semua gudang outlet (termasuk display) + distribusi — untuk titip jual. */
export async function fetchConsignmentWarehouseOptions(
  supabase: SupabaseClient,
  organizationId: string,
  outletCode: string | null
): Promise<OutletWarehouseOption[]> {
  const multiWarehouse = await isMultiWarehouseEnabled(supabase, organizationId);

  const { data: distributionRows } = await supabase
    .from("warehouses")
    .select("id, code, name, is_display, warehouse_role, active")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .eq("warehouse_role", "distribution")
    .order("name");

  const distribution = (distributionRows || []).map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    isPrimary: false,
    isDisplay: w.is_display === true,
    warehouseRole: "distribution" as WarehouseRole
  }));

  if (!outletCode) {
    if (multiWarehouse) return distribution;
    const { data: wh } = await supabase
      .from("warehouses")
      .select("id, code, name, is_display, warehouse_role")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!wh) return [];
    return [
      {
        id: wh.id,
        code: wh.code,
        name: wh.name,
        isPrimary: true,
        isDisplay: wh.is_display === true,
        warehouseRole: wh.warehouse_role === "distribution" ? "distribution" : "outlet"
      }
    ];
  }

  const { data: outletRow } = await supabase
    .from("outlets")
    .select("id, warehouse_id")
    .eq("organization_id", organizationId)
    .eq("outlet_code", outletCode.toUpperCase())
    .eq("active", true)
    .maybeSingle();

  if (!outletRow) return distribution;

  const linked = await fetchOutletWarehouseOptions(
    supabase,
    organizationId,
    outletRow.id,
    outletRow.warehouse_id
  );

  if (!multiWarehouse) {
    return linked.length ? linked : distribution;
  }

  const seen = new Set<string>();
  const merged: OutletWarehouseOption[] = [];
  for (const w of [...distribution, ...linked]) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    merged.push(w);
  }
  return merged;
}

export async function assertConsignmentWarehouseAllowed(
  supabase: SupabaseClient,
  organizationId: string,
  warehouseId: string,
  outletCode: string | null
): Promise<void> {
  const options = await fetchConsignmentWarehouseOptions(supabase, organizationId, outletCode);
  if (!options.find((w) => w.id === warehouseId)) {
    throw new Error("Gudang tidak valid untuk outlet ini");
  }
}

/** Resolve gudang titip jual — boleh display atau inbound. */
export async function resolveConsignmentWarehouseId(
  supabase: SupabaseClient,
  organizationId: string,
  options: {
    outletCode?: string | null;
    explicitWarehouseId?: string | null;
  } = {}
): Promise<string | null> {
  const explicit = String(options.explicitWarehouseId || "").trim();
  const outletCode = String(options.outletCode || "").trim() || null;

  if (explicit) {
    await assertConsignmentWarehouseAllowed(supabase, organizationId, explicit, outletCode);
    return explicit;
  }

  const whOptions = await fetchConsignmentWarehouseOptions(supabase, organizationId, outletCode);
  if (!whOptions.length) return null;

  const primary = whOptions.find((w) => w.isPrimary);
  return primary?.id ?? whOptions[0].id;
}
