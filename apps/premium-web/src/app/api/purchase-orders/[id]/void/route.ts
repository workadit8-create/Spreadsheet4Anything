import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { voidPurchaseOrder } from "@/lib/posting/void-purchase-order";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await context.params;
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
    const { data: order } = await supabase
      .from("purchase_orders")
      .select("po_no")
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .maybeSingle();

    const result = await voidPurchaseOrder(supabase, orderId, user.id, reason);

    await writeAuditLog(
      supabase,
      auditFromContext(auth, AUDIT_ACTIONS.purchaseOrderVoid, {
        resourceType: "purchase_order",
        resourceId: orderId,
        metadata: {
          poNo: order?.po_no,
          reason,
          reversedEntries: result.reversedEntries
        },
        request
      })
    );

    return NextResponse.json({
      ok: true,
      reversedEntries: result.reversedEntries,
      message: "PO dibatalkan (void)"
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
