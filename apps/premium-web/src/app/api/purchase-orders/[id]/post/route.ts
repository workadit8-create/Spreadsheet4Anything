import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueuePurchaseOrderPostingJob } from "@/lib/posting/enqueue";
import { processPendingPostingJobs } from "@/lib/posting/worker";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: order, error: orderErr } = await supabase
    .from("purchase_orders")
    .select("id, organization_id, po_no, status")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "PO tidak ditemukan" }, { status: 404 });
  }

  try {
    const jobId = await enqueuePurchaseOrderPostingJob(
      supabase,
      order.organization_id,
      order.id
    );
    const results = await processPendingPostingJobs(supabase, 1, [jobId]);
    const jobResult = results.find((r) => r.jobId === jobId);

    if (!jobResult?.ok) {
      return NextResponse.json(
        { error: jobResult?.error || "Posting gagal", poNo: order.po_no, results },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      poNo: order.po_no,
      message: `PO ${order.po_no} → jurnal POSTED`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
