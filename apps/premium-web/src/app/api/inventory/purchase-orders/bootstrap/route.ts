import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";
import { fetchOrgTaxSettings } from "@/lib/org/tax-settings";
import { supplierPkpFromMetadata } from "@/lib/suppliers/pkp";
import { productMatchesOutlet } from "@/lib/inventory/product-outlet-scope";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const addons = await fetchOrgAddons(supabase, org.id);
  if (!isAddonEnabled(addons, "pembelian") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on pembelian inventory tidak aktif" }, { status: 403 });
  }

  const url = new URL(request.url);
  const outletCode = String(url.searchParams.get("outlet_code") || "").trim();

  const [suppliersRes, kasRes, outletBootstrap, taxSettings, productsRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, code, name, metadata")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("cash_bank_accounts")
      .select("id, code, name, coa_account_name")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name"),
    fetchOutletBootstrap(supabase, org.id),
    fetchOrgTaxSettings(supabase, org.id),
    supabase
      .from("products_with_inventory_policy")
      .select("id, sku, name, sell_price, metadata, tracks_stock, category_tracks_stock, units(code, name)")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name")
  ]);

  if (suppliersRes.error) return NextResponse.json({ error: suppliersRes.error.message }, { status: 500 });
  if (kasRes.error) return NextResponse.json({ error: kasRes.error.message }, { status: 500 });
  if (productsRes.error) return NextResponse.json({ error: productsRes.error.message }, { status: 500 });

  const purchasePpnAvailable = taxSettings.ppn.pkpEnabled;

  const products = (productsRes.data || [])
    .filter((p) => effectiveTracksStock(p.tracks_stock, p.category_tracks_stock))
    .filter((p) => !outletCode || productMatchesOutlet((p.metadata || {}) as Record<string, unknown>, outletCode))
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      sellPrice: Number(p.sell_price) || 0
    }));

  return NextResponse.json({
    suppliers: (suppliersRes.data || []).map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      pkp: supplierPkpFromMetadata((s.metadata || {}) as Record<string, unknown>)
    })),
    products,
    kasBank: kasRes.data || [],
    outlets: outletBootstrap.options.map((o) => ({
      code: o.outletCode,
      label: o.label
    })),
    outletLocked: outletBootstrap.enabled && outletBootstrap.options.length <= 1,
    purchasePpn: purchasePpnAvailable
      ? {
          available: true,
          ratePercent: taxSettings.ppn.ratePercent,
          priceIncludesTax: taxSettings.ppn.priceIncludesTax
        }
      : { available: false }
  });
}
