import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueUtangPaymentJob } from "@/lib/posting/enqueue";
import { processPendingPostingJobs } from "@/lib/posting/worker";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: paymentId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("id, organization_id, status, metadata")
    .eq("id", paymentId)
    .eq("doc_type", "UTANG_PAYMENT")
    .single();

  if (payErr || !payment) {
    return NextResponse.json({ error: "Pelunasan tidak ditemukan" }, { status: 404 });
  }

  const meta = (payment.metadata || {}) as Record<string, unknown>;
  const poNo = String(meta.poNo || "");

  try {
    const jobId = await enqueueUtangPaymentJob(
      supabase,
      payment.organization_id,
      payment.id
    );
    const results = await processPendingPostingJobs(supabase, 1, [jobId]);
    const jobResult = results.find((r) => r.jobId === jobId);

    if (!jobResult?.ok) {
      return NextResponse.json(
        { error: jobResult?.error || "Posting gagal", poNo, results },
        { status: 400 }
      );
    }

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
