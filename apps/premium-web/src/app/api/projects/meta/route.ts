import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { PROJECT_STATUSES } from "@/lib/proyek/types";
import { listTaskTemplateOptions } from "@/lib/proyek/templates";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "project");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  return NextResponse.json({
    enabled: true,
    statuses: PROJECT_STATUSES,
    taskTemplates: listTaskTemplateOptions()
  });
}
