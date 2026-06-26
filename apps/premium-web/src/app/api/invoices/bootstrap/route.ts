import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { formatKasBankForInvoice } from "@/lib/org/kas-bank-display";
import { fetchOrgTaxSettings } from "@/lib/org/tax-settings";
import { productTaxableFromMetadata } from "@/lib/products/ppn";
import { getActiveTaxConfig, taxTypeLabel } from "@/lib/tax/compute";
import { fetchProjectBootstrap } from "@/lib/proyek/bootstrap-options";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const [customersRes, productsRes, kasRes, projectAddon, outletAddon, taxSettings] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, name")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, sku, name, sell_price, metadata, units(code, name)")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("cash_bank_accounts")
      .select("id, code, name, coa_account_name, metadata")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name"),
    fetchProjectBootstrap(supabase, org.id),
    fetchOutletBootstrap(supabase, org.id),
    fetchOrgTaxSettings(supabase, org.id)
  ]);

  if (customersRes.error) return NextResponse.json({ error: customersRes.error.message }, { status: 500 });
  if (productsRes.error) return NextResponse.json({ error: productsRes.error.message }, { status: 500 });
  if (kasRes.error) return NextResponse.json({ error: kasRes.error.message }, { status: 500 });

  const products = (productsRes.data || []).map((p) => {
    const rawUnit = p.units as { code: string; name: string } | { code: string; name: string }[] | null;
    const unit = Array.isArray(rawUnit) ? rawUnit[0] : rawUnit;
    const meta = (p.metadata || {}) as Record<string, unknown>;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      sell_price: p.sell_price,
      unit_code: unit?.code || "PCS",
      unit_name: unit?.name || unit?.code || "PCS",
      akunPendapatan: String(meta.akunPendapatan || "Pendapatan"),
      tax_taxable: productTaxableFromMetadata(meta)
    };
  });

  const taxConfig = getActiveTaxConfig(taxSettings);

  const kasBank = (kasRes.data || []).map((k) => ({
    ...k,
    bankDisplay: formatKasBankForInvoice(k)
  }));

  return NextResponse.json({
    customers: customersRes.data || [],
    products,
    kasBank,
    projectAddon,
    outletAddon,
    tax: taxConfig
      ? {
          active: true,
          taxType: taxConfig.taxType,
          taxLabel: taxTypeLabel(taxConfig.taxType),
          ratePercent: taxConfig.ratePercent,
          priceIncludesTax: taxConfig.priceIncludesTax
        }
      : { active: false }
  });
}
