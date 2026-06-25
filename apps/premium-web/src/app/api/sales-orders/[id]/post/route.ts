import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertOrgMatch, requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { enqueueSalesOrderPostingJob } from "@/lib/posting/enqueue";
import { processPendingPostingJobs } from "@/lib/posting/worker";

export async function POST(
  _request: Request,
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
  const { org } = auth;

  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .select("id, organization_id, order_no, status")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
  }

  try {
    assertOrgMatch(org.id, order.organization_id);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  try {
    const jobId = await enqueueSalesOrderPostingJob(
      supabase,
      order.organization_id,
      order.id
    );
    const results = await processPendingPostingJobs(supabase, 1, [jobId], org.id);
    const jobResult = results.find((r) => r.jobId === jobId);

    if (!jobResult?.ok) {
      return NextResponse.json(
        {
          error: jobResult?.error || "Posting gagal",
          orderNo: order.order_no,
          results
        },
        { status: 400 }
      );
    }

    await writeAuditLog(
      supabase,
      auditFromContext(auth, AUDIT_ACTIONS.salesOrderPost, {
        resourceType: "sales_order",
        resourceId: order.id,
        metadata: { orderNo: order.order_no, postingJobId: jobId },
        request: _request
      })
    );

    return NextResponse.json({
      ok: true,
      orderNo: order.order_no,
      postingJobId: jobId,
      message: `Invoice ${order.order_no} → jurnal POSTED`
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
