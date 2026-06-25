import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertOrgMatch, requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { enqueuePiutangPaymentJob } from "@/lib/posting/enqueue";
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
    .eq("doc_type", "PIUTANG_PAYMENT")
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
  const invoiceNo = String(meta.invoiceNo || "");

  try {
    const jobId = await enqueuePiutangPaymentJob(
      supabase,
      payment.organization_id,
      payment.id
    );
    const results = await processPendingPostingJobs(supabase, 1, [jobId], org.id);
    const jobResult = results.find((r) => r.jobId === jobId);

    if (!jobResult?.ok) {
      return NextResponse.json(
        { error: jobResult?.error || "Posting gagal", invoiceNo, results },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      invoiceNo,
      message: `Pelunasan ${invoiceNo} → jurnal POSTED`
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
