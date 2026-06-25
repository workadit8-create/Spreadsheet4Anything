import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOnboardingStatus } from "@/lib/org/onboarding-status";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const status = await fetchOnboardingStatus(supabase, auth.org);
  return NextResponse.json(status);
}
