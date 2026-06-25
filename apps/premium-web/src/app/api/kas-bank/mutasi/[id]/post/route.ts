import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { enqueueCashTransferPostingJob } from "@/lib/posting/enqueue";
import { processPendingPostingJobs } from "@/lib/posting/worker";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: transferId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: transfer, error: transferErr } = await supabase
    .from("cash_transfers")
    .select("id, organization_id, transfer_no, status")
    .eq("id", transferId)
    .single();

  if (transferErr || !transfer) {
    return NextResponse.json({ error: "Mutasi tidak ditemukan" }, { status: 404 });
  }

  try {
    const jobId = await enqueueCashTransferPostingJob(
      supabase,
      transfer.organization_id,
      transfer.id
    );
    const results = await processPendingPostingJobs(supabase, 1, [jobId]);
    const jobResult = results.find((r) => r.jobId === jobId);

    if (!jobResult?.ok) {
      return NextResponse.json(
        { error: jobResult?.error || "Posting gagal", transferNo: transfer.transfer_no, results },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      transferNo: transfer.transfer_no,
      message: `Mutasi ${transfer.transfer_no} → jurnal POSTED`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
