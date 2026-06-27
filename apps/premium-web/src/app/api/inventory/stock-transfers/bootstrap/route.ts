import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchStockTransferBootstrap } from "@/lib/inventory/stock-transfer-bootstrap";
import { canManageOutletInventory } from "@/lib/outlets/membership-scope";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "inventory");
    await requireAddon(supabase, auth.org.id, "multi_warehouse");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  if (!canManageOutletInventory(auth.role)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const url = new URL(request.url);
  const fromWarehouseId = url.searchParams.get("from_warehouse_id") || "";

  try {
    const data = await fetchStockTransferBootstrap(
      supabase,
      auth.org.id,
      auth.role,
      fromWarehouseId || undefined
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal memuat bootstrap" },
      { status: 500 }
    );
  }
}
