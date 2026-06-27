import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { voidConsignmentReturn } from "@/lib/posting/void-consignment-return";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  requirePostingRole(auth.role);
  const { user, org } = auth;

  const addons = await fetchOrgAddons(supabase, org.id);
  if (!isAddonEnabled(addons, "titip_jual") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on titip jual tidak aktif" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  try {
    const { data: header } = await supabase
      .from("consignment_returns")
      .select("return_no")
      .eq("id", id)
      .eq("organization_id", org.id)
      .maybeSingle();

    await voidConsignmentReturn(supabase, id, user.id, reason);

    return NextResponse.json({
      ok: true,
      message: `Retur titip ${header?.return_no || id} dibatalkan — stok dikembalikan`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal void retur titip" },
      { status: 400 }
    );
  }
}
