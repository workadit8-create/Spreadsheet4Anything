import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled, requireAddon } from "@/lib/org/addons";
import { requireMasterEntityRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  assertWarehouseOutletExclusive,
  clearOutletWarehouseLink,
  countActiveWarehouses,
  isMultiOutletEnabled,
  isMultiWarehouseEnabled,
  syncOutletWarehouseLink,
  type WarehouseRole
} from "@/lib/inventory/warehouse-resolve";

function parseWarehouseRole(value: unknown): WarehouseRole {
  return value === "distribution" ? "distribution" : "outlet";
}

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "inventory");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  const multiWarehouse = isAddonEnabled(addons, "multi_warehouse");
  const multiOutlet = isAddonEnabled(addons, "outlet");

  const { data: warehouses, error: whErr } = await supabase
    .from("warehouses")
    .select("id, code, name, is_default, active, is_display, warehouse_role, created_at")
    .eq("organization_id", auth.org.id)
    .order("name");

  if (whErr) return NextResponse.json({ error: whErr.message }, { status: 500 });

  const { data: outletLinks } = await supabase
    .from("outlet_warehouses")
    .select("warehouse_id, is_primary, outlets(id, outlet_code, name, active)")
    .eq("organization_id", auth.org.id);

  const { data: outlets } = await supabase
    .from("outlets")
    .select("id, outlet_code, name, warehouse_id, active")
    .eq("organization_id", auth.org.id)
    .order("sort_order")
    .order("name");

  const linkByWarehouse = new Map<
    string,
    Array<{ outlet_code: string; name: string; active: boolean; is_primary: boolean }>
  >();

  for (const link of outletLinks || []) {
    const outlet = link.outlets as
      | { outlet_code: string; name: string; active: boolean }
      | { outlet_code: string; name: string; active: boolean }[]
      | null;
    const o = Array.isArray(outlet) ? outlet[0] : outlet;
    if (!o) continue;
    const list = linkByWarehouse.get(link.warehouse_id) || [];
    list.push({
      outlet_code: o.outlet_code,
      name: o.name,
      active: o.active !== false,
      is_primary: link.is_primary === true
    });
    linkByWarehouse.set(link.warehouse_id, list);
  }

  const items = (warehouses || []).map((w) => ({
    ...w,
    outlets: linkByWarehouse.get(w.id) || []
  }));

  return NextResponse.json({
    warehouses: items,
    outlets: outlets || [],
    flags: {
      multiWarehouse,
      multiOutlet,
      canAddWarehouse: multiWarehouse
    }
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requireMasterEntityRole(auth.role, "outlet");
    await requireAddon(supabase, auth.org.id, "inventory");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const body = await request.json();
  const code = String(body.code || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const active = body.active !== false;
  const isDefault = body.is_default === true;
  const isDisplay = body.is_display === true;
  const warehouseRole = parseWarehouseRole(body.warehouse_role || body.warehouseRole);
  const outletId = String(body.outlet_id || body.outletId || "").trim() || null;
  const warehouseId = String(body.id || "").trim() || null;

  if (!code) return NextResponse.json({ error: "Kode gudang wajib" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nama gudang wajib" }, { status: 400 });

  const multiWarehouse = await isMultiWarehouseEnabled(supabase, auth.org.id);
  const multiOutlet = await isMultiOutletEnabled(supabase, auth.org.id);

  if (!warehouseId) {
    const count = await countActiveWarehouses(supabase, auth.org.id);
    if (!multiWarehouse && count >= 1) {
      return NextResponse.json(
        { error: "Add-on Multi Warehouse tidak aktif — hanya satu gudang default yang diizinkan" },
        { status: 403 }
      );
    }
  }

  if (warehouseRole === "distribution" && isDisplay) {
    return NextResponse.json(
      { error: "Gudang distribusi tidak boleh ditandai display (stok jual)" },
      { status: 400 }
    );
  }

  if (warehouseId) {
    if (outletId) {
      const exclusiveErr = await assertWarehouseOutletExclusive(
        supabase,
        auth.org.id,
        warehouseId,
        outletId
      );
      if (exclusiveErr) {
        return NextResponse.json({ error: exclusiveErr }, { status: 400 });
      }
    }
  }

  if (outletId && warehouseRole === "outlet") {
    const { data: outletRow } = await supabase
      .from("outlets")
      .select("id")
      .eq("id", outletId)
      .eq("organization_id", auth.org.id)
      .maybeSingle();
    if (!outletRow) {
      return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 400 });
    }
  }

  if (isDefault && multiOutlet) {
    return NextResponse.json(
      { error: "Gudang default hanya untuk org single-outlet tanpa multi outlet" },
      { status: 400 }
    );
  }

  if (isDefault) {
    await supabase
      .from("warehouses")
      .update({ is_default: false })
      .eq("organization_id", auth.org.id);
  }

  const row = {
    organization_id: auth.org.id,
    code,
    name,
    active,
    is_default: isDefault,
    is_display: multiWarehouse ? isDisplay : true,
    warehouse_role: multiWarehouse ? warehouseRole : "outlet"
  };

  let savedId = warehouseId;

  if (warehouseId) {
    const { data, error } = await supabase
      .from("warehouses")
      .update(row)
      .eq("id", warehouseId)
      .eq("organization_id", auth.org.id)
      .select("id, code, name, is_default, active, is_display, warehouse_role")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    savedId = data.id;
  } else {
    const { data, error } = await supabase.from("warehouses").insert(row).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    savedId = data.id;
  }

  if (!savedId) {
    return NextResponse.json({ error: "Gagal simpan gudang" }, { status: 500 });
  }

  if (multiWarehouse) {
    if (warehouseRole === "distribution") {
      await clearOutletWarehouseLink(supabase, auth.org.id, savedId);
    } else if (outletId) {
      await syncOutletWarehouseLink(supabase, {
        organizationId: auth.org.id,
        outletId,
        warehouseId: savedId,
        isPrimary: body.is_primary !== false
      });

      if (body.is_primary !== false) {
        await supabase
          .from("outlets")
          .update({ warehouse_id: savedId, updated_at: new Date().toISOString() })
          .eq("id", outletId)
          .eq("organization_id", auth.org.id);
      }
    }
  } else if (outletId) {
    await syncOutletWarehouseLink(supabase, {
      organizationId: auth.org.id,
      outletId,
      warehouseId: savedId,
      isPrimary: true
    });
    await supabase
      .from("outlets")
      .update({ warehouse_id: savedId, updated_at: new Date().toISOString() })
      .eq("id", outletId)
      .eq("organization_id", auth.org.id);
  }

  const { data: saved } = await supabase
    .from("warehouses")
    .select("id, code, name, is_default, active, is_display, warehouse_role")
    .eq("id", savedId)
    .single();

  return NextResponse.json({ warehouse: saved });
}
