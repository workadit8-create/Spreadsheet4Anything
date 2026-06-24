import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processPendingPostingJobs } from "@/lib/posting/worker";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 5;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.limit) limit = Math.min(20, Math.max(1, Number(body.limit)));
  } catch {
    /* empty body ok */
  }

  try {
    const results = await processPendingPostingJobs(supabase, limit);
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
