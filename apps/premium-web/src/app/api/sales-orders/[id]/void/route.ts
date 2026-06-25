import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { voidSalesOrder } from "@/lib/posting/void-sales-order";

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

  let reason = "";
  try {
    const body = await request.json().catch(() => ({}));
    reason = String(body?.reason || "").trim();
  } catch {
    /* empty */
  }

  try {
    const { data: order } = await supabase
      .from("sales_orders")
      .select("order_no")
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .maybeSingle();

    const { reversedEntries } = await voidSalesOrder(supabase, orderId, user.id, reason);

    await writeAuditLog(
      supabase,
      auditFromContext(auth, AUDIT_ACTIONS.salesOrderVoid, {
        resourceType: "sales_order",
        resourceId: orderId,
        metadata: {
          orderNo: order?.order_no,
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
          ? `Invoice dibatalkan — ${reversedEntries} jurnal pembalik dibuat`
          : "Invoice dibatalkan"
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
