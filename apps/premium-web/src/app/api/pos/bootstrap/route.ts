import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchPosBootstrap } from "@/lib/pos/bootstrap";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  try {
    await requireAddon(supabase, auth.org.id, "pos");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Add-on POS tidak aktif" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const outletCode = url.searchParams.get("outlet_code") || "";

  try {
    const data = await fetchPosBootstrap(supabase, auth.org.id, outletCode || undefined);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memuat data kasir" },
      { status: 500 }
    );
  }
}
