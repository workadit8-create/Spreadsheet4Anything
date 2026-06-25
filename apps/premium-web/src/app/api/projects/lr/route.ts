import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { buildProjectLrReport } from "@/lib/proyek/lr-report";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "project");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const url = new URL(request.url);
  const report = await buildProjectLrReport(supabase, auth.org.id, {
    startDate: url.searchParams.get("start") || "",
    endDate: url.searchParams.get("end") || "",
    status: url.searchParams.get("status") || "",
    projectCode: url.searchParams.get("code") || ""
  });

  return NextResponse.json(report);
}
