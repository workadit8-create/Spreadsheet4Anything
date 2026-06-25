import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchCompanyProfile } from "@/lib/org/company-profile";
import { fetchPenjualanDetail } from "@/lib/penjualan/fetch-history-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  try {
    const detail = await fetchPenjualanDetail(supabase, org.id, id);
    if (!detail) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });

    const company = await fetchCompanyProfile(supabase, org);

    return NextResponse.json({
      detail,
      company: {
        name: company.name,
        address: company.address,
        phone: company.phone,
        logoUrl: company.logoUrl
      }
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memuat detail" },
      { status: 500 }
    );
  }
}
