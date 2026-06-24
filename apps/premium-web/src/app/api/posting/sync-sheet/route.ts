import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processSheetSyncRetries } from "@/lib/posting/worker";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await processSheetSyncRetries(supabase, 20);
    return NextResponse.json({ synced: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
