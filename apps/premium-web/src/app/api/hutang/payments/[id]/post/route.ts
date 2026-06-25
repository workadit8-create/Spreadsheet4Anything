import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertOrgMatch, requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { enqueueUtangPaymentJob } from "@/lib/posting/enqueue";
import { processPendingPostingJobs } from "@/lib/posting/worker";

export async function POST(
  _request: Request,
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
  const { org } = auth;

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("id, organization_id, status, metadata")
    .eq("id", paymentId)
    .eq("doc_type", "UTANG_PAYMENT")
    .single();

  if (payErr || !payment) {
    return NextResponse.json({ error: "Pelunasan tidak ditemukan" }, { status: 404 });
  }

  try {
    assertOrgMatch(org.id, payment.organization_id);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const meta = (payment.metadata || {}) as Record<string, unknown>;
  const poNo = String(meta.poNo || "");

  try {
    const jobId = await enqueueUtangPaymentJob(
      supabase,
      payment.organization_id,
      payment.id
    );
    const results = await processPendingPostingJobs(supabase, 1, [jobId], org.id);
    const jobResult = results.find((r) => r.jobId === jobId);

    if (!jobResult?.ok) {
      return NextResponse.json(
        { error: jobResult?.error || "Posting gagal", poNo, results },
        { status: 400 }
      );
    }

    await writeAuditLog(
      supabase,
      auditFromContext(auth, AUDIT_ACTIONS.hutangPaymentPost, {
        resourceType: "payment",
        resourceId: payment.id,
        metadata: { poNo },
        request: _request
      })
    );

    return NextResponse.json({
      ok: true,
      poNo,
      message: `Pelunasan ${poNo} → jurnal POSTED`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
