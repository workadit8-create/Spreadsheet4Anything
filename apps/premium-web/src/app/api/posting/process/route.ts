import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processPendingPostingJobs } from "@/lib/posting/worker";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  requirePostingRole(auth.role);
  const { org } = auth;

  let limit = 5;
  let retryFailed = true;
  let jobIds: string[] = [];
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.limit) limit = Math.min(20, Math.max(1, Number(body.limit)));
    if (body?.retryFailed === false) retryFailed = false;
    if (Array.isArray(body?.jobIds)) {
      jobIds = body.jobIds.map((id: unknown) => String(id)).filter(Boolean);
    }
  } catch {
    /* empty body ok */
  }

  if (retryFailed) {
    await supabase
      .from("posting_jobs")
      .update({ status: "PENDING", updated_at: new Date().toISOString() })
      .eq("organization_id", org.id)
      .eq("status", "FAILED");
  }

  try {
    const results = await processPendingPostingJobs(
      supabase,
      limit,
      jobIds.length ? jobIds : undefined,
      org.id
    );
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
