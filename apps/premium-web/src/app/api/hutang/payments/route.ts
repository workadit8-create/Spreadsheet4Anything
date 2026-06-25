import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const { data: payments, error } = await supabase
    .from("payments")
    .select("id, amount, paid_at, status, metadata, void_reason")
    .eq("organization_id", org.id)
    .eq("doc_type", "UTANG_PAYMENT")
    .order("paid_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (payments || []).map((p) => p.id);
  const { data: jobs } = ids.length
    ? await supabase
        .from("posting_jobs")
        .select("doc_id, status, last_error")
        .eq("doc_type", "UTANG_PAYMENT")
        .in("doc_id", ids)
    : { data: [] };

  const jobsByPayment = new Map((jobs || []).map((j) => [j.doc_id, j]));

  const items = (payments || []).map((p) => {
    const meta = (p.metadata || {}) as Record<string, unknown>;
    const job = jobsByPayment.get(p.id);
    return {
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paid_at,
      status: p.status || "CONFIRMED",
      poNo: String(meta.poNo || ""),
      supplierName: String(meta.supplierName || ""),
      keterangan: String(meta.keterangan || ""),
      voidReason: p.void_reason,
      postingError: job?.status === "FAILED" ? job.last_error : null
    };
  });

  return NextResponse.json({ items });
}
