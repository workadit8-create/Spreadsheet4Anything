import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchProjectBootstrap } from "@/lib/proyek/bootstrap-options";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";
import { fetchOrgTaxSettings } from "@/lib/org/tax-settings";
import { supplierPkpFromMetadata } from "@/lib/suppliers/pkp";
import { isFixedAssetCoaName } from "@/lib/assets/coa-defaults";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const [suppliersRes, categoriesRes, kasRes, coaRes, projectAddon, outletAddon, taxSettings] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, code, name, metadata")
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
    supabase
      .from("coa_accounts")
      .select("name, metadata")
      .eq("organization_id", org.id)
      .eq("active", true),
    fetchProjectBootstrap(supabase, org.id),
    fetchOutletBootstrap(supabase, org.id),
    fetchOrgTaxSettings(supabase, org.id)
  ]);

  if (suppliersRes.error) return NextResponse.json({ error: suppliersRes.error.message }, { status: 500 });
  if (categoriesRes.error) return NextResponse.json({ error: categoriesRes.error.message }, { status: 500 });
  if (kasRes.error) return NextResponse.json({ error: kasRes.error.message }, { status: 500 });
  if (coaRes.error) return NextResponse.json({ error: coaRes.error.message }, { status: 500 });

  const coaSubByName = new Map<string, string>();
  for (const row of coaRes.data || []) {
    coaSubByName.set(
      String(row.name || ""),
      String((row.metadata as Record<string, unknown> | null)?.sub_category || "")
    );
  }
  const fixedAssetCoaAccounts = (coaRes.data || [])
    .map((row) => String(row.name || ""))
    .filter((name) => isFixedAssetCoaName(name, coaSubByName));

  const purchasePpnAvailable = taxSettings.ppn.pkpEnabled;

  return NextResponse.json({
    suppliers: (suppliersRes.data || []).map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      pkp: supplierPkpFromMetadata((s.metadata || {}) as Record<string, unknown>)
    })),
    purchaseCategories: (categoriesRes.data || []).map((c) => ({
      id: c.id,
      label: `${c.category} — ${c.sub_category}`,
      coa_account: c.coa_account
    })),
    kasBank: kasRes.data || [],
    fixedAssetCoaAccounts,
    projectAddon,
    outletAddon,
    purchasePpn: purchasePpnAvailable
      ? {
          available: true,
          ratePercent: taxSettings.ppn.ratePercent,
          priceIncludesTax: taxSettings.ppn.priceIncludesTax
        }
      : { available: false }
  });
}
