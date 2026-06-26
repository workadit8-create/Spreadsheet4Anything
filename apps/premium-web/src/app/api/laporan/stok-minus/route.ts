import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { buildStokMinusReport } from "@/lib/laporan/stok-minus";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  try {
    const report = await buildStokMinusReport(supabase, auth.org.id);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memuat laporan" },
      { status: 500 }
    );
  }
}
