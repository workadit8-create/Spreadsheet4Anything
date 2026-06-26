import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { buildOutletLrReport } from "@/lib/outlets/lr-report";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get("start") || "";
  const endDate = url.searchParams.get("end") || "";

  try {
    const report = await buildOutletLrReport(supabase, auth.org.id, { startDate, endDate });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memuat laporan outlet" },
      { status: 500 }
    );
  }
}
