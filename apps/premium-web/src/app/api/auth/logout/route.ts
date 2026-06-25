import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemoOrg, resetDemoOrganization } from "@/lib/org/demo-reset";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function POST() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  if (isDemoOrg(auth.org)) {
    const { error } = await resetDemoOrganization(supabase, auth.org.id);
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
  }

  await supabase.auth.signOut();

  return NextResponse.json({ ok: true, redirect: "/login" });
}
