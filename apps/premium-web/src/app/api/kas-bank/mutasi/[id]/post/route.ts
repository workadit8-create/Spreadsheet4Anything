import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertOrgMatch, requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { enqueueCashTransferPostingJob } from "@/lib/posting/enqueue";
import { processPendingPostingJobs } from "@/lib/posting/worker";

export async function POST(
  _request: Request,
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
  const { org } = auth;

  const { data: transfer, error: transferErr } = await supabase
    .from("cash_transfers")
    .select("id, organization_id, transfer_no, status")
    .eq("id", transferId)
    .single();

  if (transferErr || !transfer) {
    return NextResponse.json({ error: "Mutasi tidak ditemukan" }, { status: 404 });
  }

  try {
    assertOrgMatch(org.id, transfer.organization_id);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  try {
    const jobId = await enqueueCashTransferPostingJob(
      supabase,
      transfer.organization_id,
      transfer.id
    );
    const results = await processPendingPostingJobs(supabase, 1, [jobId], org.id);
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
