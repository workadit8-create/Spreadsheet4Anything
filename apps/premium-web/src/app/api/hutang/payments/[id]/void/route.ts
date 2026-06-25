import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { voidUtangPayment } from "@/lib/posting/void-utang-payment";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: paymentId } = await context.params;
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  requirePostingRole(auth.role);
  const { user } = auth;

  let reason = "";
  try {
    const body = await request.json().catch(() => ({}));
    reason = String(body?.reason || "").trim();
  } catch {
    /* empty */
  }

  try {
    const { reversedEntries } = await voidUtangPayment(
      supabase,
      paymentId,
      user.id,
      reason
    );
    return NextResponse.json({
      ok: true,
      reversedEntries,
      message:
        reversedEntries > 0
          ? `Pelunasan dibatalkan — ${reversedEntries} jurnal pembalik`
          : "Pelunasan dibatalkan"
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
