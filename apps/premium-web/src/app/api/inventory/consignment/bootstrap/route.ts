import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { isConsignmentProduct } from "@/lib/products/consignment-policy";
import { productMatchesOutlet } from "@/lib/inventory/product-outlet-scope";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";

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
  if (!isAddonEnabled(addons, "titip_jual") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on titip jual tidak aktif" }, { status: 403 });
  }

  const url = new URL(request.url);
  const outletFilter = String(url.searchParams.get("outlet_code") || "").trim();
  const supplierFilter = String(url.searchParams.get("supplier_id") || "").trim();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("name");

  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, sell_price, metadata")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("name");

  const consignmentProducts = (products || [])
    .filter((p) => {
      const meta = (p.metadata || {}) as Record<string, unknown>;
      if (!isConsignmentProduct(meta)) return false;
      if (outletFilter && !productMatchesOutlet(meta, outletFilter)) return false;
      if (supplierFilter && String(meta.consignmentSupplierId || "") !== supplierFilter) return false;
      return true;
    })
    .map((p) => {
      const meta = (p.metadata || {}) as Record<string, unknown>;
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        sellPrice: Number(p.sell_price) || 0,
        settlementPrice: Number(meta.consignmentSettlementPrice) || 0,
        supplierId: String(meta.consignmentSupplierId || "")
      };
    });

  const { data: kasBank } = await supabase
    .from("cash_bank_accounts")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("name");

  let outlets: Array<{ code: string; label: string }> = [];
  let outletLocked = false;
  if (isAddonEnabled(addons, "outlet")) {
    const outletBootstrap = await fetchOutletBootstrap(supabase, org.id);
    outlets = outletBootstrap.options.map((o) => ({
      code: o.outletCode,
      label: o.label
    }));
    outletLocked = outletBootstrap.options.length <= 1;
  }

  return NextResponse.json({
    suppliers: suppliers || [],
    products: consignmentProducts,
    kasBank: kasBank || [],
    outlets,
    outletLocked
  });
}
