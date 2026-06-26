import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireMasterEntityRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "inventory");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { data: warehouses, error: whErr } = await supabase
    .from("warehouses")
    .select("id, code, name, is_default, active, created_at")
    .eq("organization_id", auth.org.id)
    .order("name");

  if (whErr) return NextResponse.json({ error: whErr.message }, { status: 500 });

  const { data: outlets } = await supabase
    .from("outlets")
    .select("id, outlet_code, name, warehouse_id, active")
    .eq("organization_id", auth.org.id)
    .order("sort_order")
    .order("name");

  const outletsByWarehouse = new Map<string, Array<{ outlet_code: string; name: string; active: boolean }>>();
  for (const o of outlets || []) {
    if (!o.warehouse_id) continue;
    const list = outletsByWarehouse.get(o.warehouse_id) || [];
    list.push({
      outlet_code: o.outlet_code,
      name: o.name,
      active: o.active !== false
    });
    outletsByWarehouse.set(o.warehouse_id, list);
  }

  const items = (warehouses || []).map((w) => ({
    ...w,
    outlets: outletsByWarehouse.get(w.id) || []
  }));

  return NextResponse.json({ warehouses: items });
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

  if (!code) return NextResponse.json({ error: "Kode gudang wajib" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nama gudang wajib" }, { status: 400 });

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
    is_default: isDefault
  };

  if (body.id) {
    const { data, error } = await supabase
      .from("warehouses")
      .update(row)
      .eq("id", body.id)
      .eq("organization_id", auth.org.id)
      .select("id, code, name, is_default, active")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ warehouse: data });
  }

  const { data, error } = await supabase.from("warehouses").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ warehouse: data });
}
