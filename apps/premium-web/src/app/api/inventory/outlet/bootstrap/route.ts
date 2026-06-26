import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchOutletInventoryBootstrap } from "@/lib/inventory/outlet-bootstrap";
import { canManageOutletInventory } from "@/lib/outlets/membership-scope";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  if (!canManageOutletInventory(auth.role)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  try {
    await requireAddon(supabase, auth.org.id, "inventory");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Add-on Multi Outlet tidak aktif" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const outletCode = url.searchParams.get("outlet_code") || "";

  try {
    const data = await fetchOutletInventoryBootstrap(
      supabase,
      auth.org.id,
      auth.role,
      outletCode || undefined
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memuat data stok outlet" },
      { status: 500 }
    );
  }
}
