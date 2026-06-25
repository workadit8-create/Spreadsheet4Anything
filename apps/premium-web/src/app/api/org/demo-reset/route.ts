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

  if (!isDemoOrg(auth.org)) {
    return NextResponse.json({ error: "Reset hanya untuk akun demo" }, { status: 403 });
  }

  const { error } = await resetDemoOrganization(supabase, auth.org.id);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Data demo direset ke kondisi awal" });
}
