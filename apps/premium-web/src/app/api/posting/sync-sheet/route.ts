import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processSheetSyncRetries, processPelunasanSheetSyncRetries } from "@/lib/posting/worker";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orderResults = await processSheetSyncRetries(supabase, 20);
    const pelunasanResults = await processPelunasanSheetSyncRetries(supabase, 20);
    return NextResponse.json({
      synced: orderResults.length + pelunasanResults.length,
      orders: orderResults,
      pelunasan: pelunasanResults
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
