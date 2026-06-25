import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchProjectBootstrap } from "@/lib/proyek/bootstrap-options";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const [suppliersRes, categoriesRes, kasRes, projectAddon] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("purchase_categories")
      .select("id, category, sub_category, coa_account")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("category"),
    supabase
      .from("cash_bank_accounts")
      .select("id, code, name, coa_account_name")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name"),
    fetchProjectBootstrap(supabase, org.id)
  ]);

  if (suppliersRes.error) return NextResponse.json({ error: suppliersRes.error.message }, { status: 500 });
  if (categoriesRes.error) return NextResponse.json({ error: categoriesRes.error.message }, { status: 500 });
  if (kasRes.error) return NextResponse.json({ error: kasRes.error.message }, { status: 500 });

  return NextResponse.json({
    suppliers: suppliersRes.data || [],
    purchaseCategories: (categoriesRes.data || []).map((c) => ({
      id: c.id,
      label: `${c.category} — ${c.sub_category}`,
      coa_account: c.coa_account
    })),
    kasBank: kasRes.data || [],
    projectAddon
  });
}
