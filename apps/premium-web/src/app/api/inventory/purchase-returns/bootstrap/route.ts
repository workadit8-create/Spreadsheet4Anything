import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";
import { fetchOrgTaxSettings } from "@/lib/org/tax-settings";
import { supplierPkpFromMetadata } from "@/lib/suppliers/pkp";
import { productMatchesOutlet } from "@/lib/inventory/product-outlet-scope";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";
import { isInventoryPurchaseOrder } from "@/lib/inventory/purchase-inventory";
import { sumReturnedQtyByPurchaseLine } from "@/lib/inventory/purchase-return";

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
  const supplierId = String(url.searchParams.get("supplier_id") || "").trim();
  const purchaseOrderId = String(url.searchParams.get("purchase_order_id") || "").trim();

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

  let purchaseOrders: Array<{ id: string; poNo: string; orderDate: string; total: number }> = [];
  let poLines: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string | null;
    poQty: number;
    returnedQty: number;
    returnableQty: number;
    unitCost: number;
    lineTotal: number;
  }> = [];

  if (supplierId) {
    const { data: pos, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, po_no, order_date, total, metadata")
      .eq("organization_id", org.id)
      .eq("supplier_id", supplierId)
      .eq("status", "POSTED")
      .order("order_date", { ascending: false })
      .limit(50);

    if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 });

    purchaseOrders = (pos || [])
      .filter((po) => isInventoryPurchaseOrder((po.metadata || {}) as Record<string, unknown>))
      .map((po) => ({
        id: po.id,
        poNo: po.po_no,
        orderDate: po.order_date,
        total: Number(po.total) || 0
      }));

    const poId = purchaseOrderId || purchaseOrders[0]?.id;
    if (poId) {
      const { data: lines, error: lineErr } = await supabase
        .from("purchase_lines")
        .select("id, product_id, description, qty, unit_cost, line_total, metadata, products(name, sku)")
        .eq("purchase_order_id", poId)
        .order("sort_order");

      if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

      const lineIds = (lines || []).map((l) => l.id);
      const returnedMap = await sumReturnedQtyByPurchaseLine(supabase, org.id, lineIds);

      poLines = (lines || [])
        .filter((l) => l.product_id)
        .map((l) => {
          const prod = l.products as
            | { name: string; sku: string | null }
            | { name: string; sku: string | null }[]
            | null;
          const p = Array.isArray(prod) ? prod[0] : prod;
          const poQty = Number(l.qty) || 0;
          const returnedQty = returnedMap.get(l.id) || 0;
          return {
            id: l.id,
            productId: String(l.product_id),
            productName: p?.name || l.description || "—",
            sku: p?.sku || null,
            poQty,
            returnedQty,
            returnableQty: Math.max(0, poQty - returnedQty),
            unitCost: Number(l.unit_cost) || 0,
            lineTotal: Number(l.line_total) || 0
          };
        })
        .filter((l) => l.returnableQty > 0);
    }
  }

  const selectedSupplier = (suppliersRes.data || []).find((s) => s.id === supplierId);

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
      : { available: false },
    purchaseOrders,
    poLines,
    supplierPkp: selectedSupplier
      ? supplierPkpFromMetadata((selectedSupplier.metadata || {}) as Record<string, unknown>)
      : false
  });
}
