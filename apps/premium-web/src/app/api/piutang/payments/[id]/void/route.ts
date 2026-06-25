import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { voidPiutangPayment } from "@/lib/posting/void-piutang-payment";

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
  const { user, org } = auth;

  let reason = "";
  try {
    const body = await request.json().catch(() => ({}));
    reason = String(body?.reason || "").trim();
  } catch {
    /* empty */
  }

  try {
    const { data: payment } = await supabase
      .from("payments")
      .select("metadata")
      .eq("id", paymentId)
      .eq("organization_id", org.id)
      .maybeSingle();
    const meta = (payment?.metadata || {}) as Record<string, unknown>;

    const { reversedEntries } = await voidPiutangPayment(
      supabase,
      paymentId,
      user.id,
      reason
    );

    await writeAuditLog(
      supabase,
      auditFromContext(auth, AUDIT_ACTIONS.piutangPaymentVoid, {
        resourceType: "payment",
        resourceId: paymentId,
        metadata: {
          invoiceNo: meta.invoiceNo ? String(meta.invoiceNo) : undefined,
          reason: reason || undefined,
          reversedEntries
        },
        request
      })
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
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
