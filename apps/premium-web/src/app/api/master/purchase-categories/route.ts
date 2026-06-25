import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMasterEntityRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const { data, error } = await supabase
    .from("purchase_categories")
    .select("id, category, sub_category, coa_account, active, created_at")
    .eq("organization_id", org.id)
    .order("category");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requireMasterEntityRole(auth.role, "purchaseCategory");
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const body = await request.json();
  const category = String(body.category || "").trim();
  const subCategory = String(body.sub_category || "").trim();
  const coaAccount = String(body.coa_account || "").trim();
  if (!category || !subCategory) {
    return NextResponse.json({ error: "Kategori dan sub-kategori wajib" }, { status: 400 });
  }
  if (!coaAccount) return NextResponse.json({ error: "Akun COA wajib" }, { status: 400 });

  const row = {
    organization_id: org.id,
    category,
    sub_category: subCategory,
    coa_account: coaAccount,
    active: body.active !== false
  };

  if (body.id) {
    const { data, error } = await supabase
      .from("purchase_categories")
      .update(row)
      .eq("id", body.id)
      .eq("organization_id", org.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  const { data, error } = await supabase.from("purchase_categories").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
