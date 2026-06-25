import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { voidCashTransfer } from "@/lib/posting/void-cash-transfer";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: transferId } = await context.params;
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
    const { data: transfer } = await supabase
      .from("cash_transfers")
      .select("transfer_no")
      .eq("id", transferId)
      .eq("organization_id", org.id)
      .maybeSingle();

    const result = await voidCashTransfer(supabase, transferId, user.id, reason);

    await writeAuditLog(
      supabase,
      auditFromContext(auth, AUDIT_ACTIONS.cashTransferVoid, {
        resourceType: "cash_transfer",
        resourceId: transferId,
        metadata: {
          transferNo: transfer?.transfer_no,
          reason,
          reversedEntries: result.reversedEntries
        },
        request
      })
    );

    return NextResponse.json({
      ok: true,
      reversedEntries: result.reversedEntries,
      message: "Mutasi dibatalkan (void)"
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
