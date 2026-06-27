import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { voidPurchaseReturn } from "@/lib/posting/void-purchase-return";

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

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  try {
    const { data: header } = await supabase
      .from("purchase_returns")
      .select("return_no")
      .eq("id", id)
      .eq("organization_id", org.id)
      .maybeSingle();

    const result = await voidPurchaseReturn(supabase, id, user.id, reason);

    return NextResponse.json({
      ok: true,
      reversedEntries: result.reversedEntries,
      message: `Retur ${header?.return_no || id} dibatalkan`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal void retur" },
      { status: 400 }
    );
  }
}
