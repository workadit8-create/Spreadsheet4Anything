import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchCompanyProfile } from "@/lib/org/company-profile";
import { fetchPenjualanDetail } from "@/lib/penjualan/fetch-history-data";

function customerAddress(meta: Record<string, unknown>): string {
  return String(meta.alamat || meta.address || "").trim();
}

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

    let customer: {
      name: string;
      phone: string;
      email: string;
      address: string;
    } | null = null;

    if (detail.order.customerId) {
      const { data: cust } = await supabase
        .from("customers")
        .select("name, phone, email, metadata")
        .eq("id", detail.order.customerId)
        .eq("organization_id", org.id)
        .maybeSingle();

      if (cust) {
        const meta = (cust.metadata || {}) as Record<string, unknown>;
        customer = {
          name: cust.name || detail.order.customerName,
          phone: cust.phone || "",
          email: cust.email || "",
          address: customerAddress(meta)
        };
      }
    }

    return NextResponse.json({
      detail,
      company: {
        name: company.name,
        address: company.address,
        phone: company.phone,
        logoUrl: company.logoUrl
      },
      customer
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memuat detail" },
      { status: 500 }
    );
  }
}
