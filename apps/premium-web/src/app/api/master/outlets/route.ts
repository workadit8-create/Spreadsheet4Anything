import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, requireMasterEntityRole, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { normalizeOutletCode } from "@/lib/outlets/helpers";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  try {
    await requireAddon(supabase, auth.org.id, "outlet");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Add-on Multi Outlet tidak aktif" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("outlets")
    .select("id, outlet_code, name, business_sector, warehouse_id, active, sort_order, warehouses(code, name)")
    .eq("organization_id", auth.org.id)
    .order("sort_order")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("id, code, name, is_default")
    .eq("organization_id", auth.org.id)
    .eq("active", true)
    .order("name");

  return NextResponse.json({ outlets: data || [], warehouses: warehouses || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requireMasterEntityRole(auth.role, "outlet");
    await requireAddon(supabase, auth.org.id, "outlet");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const body = await request.json();

  if (body.id) {
    const warehouseId = String(body.warehouse_id || body.warehouseId || "").trim() || null;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = String(body.name || "").trim();
    if (body.business_sector !== undefined || body.businessSector !== undefined) {
      patch.business_sector = String(body.business_sector || body.businessSector || "retail");
    }
    if (body.warehouse_id !== undefined || body.warehouseId !== undefined) {
      patch.warehouse_id = warehouseId;
    }
    if (body.sort_order !== undefined || body.sortOrder !== undefined) {
      patch.sort_order = Number(body.sort_order ?? body.sortOrder ?? 0);
    }
    if (body.active !== undefined) patch.active = body.active !== false;

    const { data, error } = await supabase
      .from("outlets")
      .update(patch)
      .eq("id", body.id)
      .eq("organization_id", auth.org.id)
      .select("id, outlet_code, name, warehouse_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ outlet: data });
  }

  const outletCode = normalizeOutletCode(body.outlet_code || body.outletCode);
  const name = String(body.name || "").trim();
  const businessSector = String(body.business_sector || body.businessSector || "retail");
  const warehouseId = String(body.warehouse_id || body.warehouseId || "").trim() || null;
  const sortOrder = Number(body.sort_order ?? body.sortOrder ?? 0);
  const active = body.active !== false;

  if (!outletCode || outletCode === "PUSAT") {
    return NextResponse.json({ error: "Kode outlet tidak valid" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Nama outlet wajib" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("outlets")
    .insert({
      organization_id: auth.org.id,
      outlet_code: outletCode,
      name,
      business_sector: businessSector,
      warehouse_id: warehouseId,
      sort_order: sortOrder,
      active
    })
    .select("id, outlet_code, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ outlet: data });
}
