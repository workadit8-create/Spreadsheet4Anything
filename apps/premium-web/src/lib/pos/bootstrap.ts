import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKasBankForInvoice } from "@/lib/org/kas-bank-display";
import { fetchOrgTaxSettings } from "@/lib/org/tax-settings";
import { productTaxableFromMetadata } from "@/lib/products/ppn";
import { getActiveTaxConfig, taxTypeLabel } from "@/lib/tax/compute";
import { ensureWalkInCustomer } from "@/lib/pos/walk-in-customer";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";

export type PosBootstrapProduct = {
  id: string;
  sku: string | null;
  name: string;
  sell_price: number;
  category_id: string | null;
  category_name: string | null;
  unit_code: string;
  unit_name: string;
  effective_tracks_stock: boolean;
  effective_product_kind: string;
  stock_qty: number | null;
  tax_taxable: boolean;
};

export async function fetchPosBootstrap(
  supabase: SupabaseClient,
  organizationId: string,
  outletCodeFilter?: string
) {
  let warehouseFilterId: string | null = null;
  if (outletCodeFilter) {
    const { data: outletRow } = await supabase
      .from("outlets")
      .select("warehouse_id")
      .eq("organization_id", organizationId)
      .eq("outlet_code", outletCodeFilter.trim().toUpperCase())
      .eq("active", true)
      .maybeSingle();
    warehouseFilterId = outletRow?.warehouse_id || null;
  }

  const { data: warehouse } = warehouseFilterId
    ? await supabase
        .from("warehouses")
        .select("id, code, name")
        .eq("id", warehouseFilterId)
        .maybeSingle()
    : await supabase
        .from("warehouses")
        .select("id, code, name")
        .eq("organization_id", organizationId)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();

  const warehouseId = warehouse?.id || null;

  const [walkInCustomerId, customersRes, productsRes, categoriesRes, kasRes, taxSettings, orgRes, outletBootstrap] =
    await Promise.all([
      ensureWalkInCustomer(supabase, organizationId),
      supabase
        .from("customers")
        .select("id, code, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("products_with_inventory_policy")
        .select(
          "id, sku, name, sell_price, category_id, category_name, metadata, effective_tracks_stock, effective_product_kind, units(code, name)"
        )
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("product_categories")
        .select("id, code, name, sort_order")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("cash_bank_accounts")
        .select("id, code, name, coa_account_name, metadata")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      fetchOrgTaxSettings(supabase, organizationId),
      supabase
        .from("organizations")
        .select("name, business_sectors")
        .eq("id", organizationId)
        .single(),
      fetchOutletBootstrap(supabase, organizationId)
    ]);

  let stockMap = new Map<string, number>();
  if (warehouseId && productsRes.data?.length) {
    const productIds = productsRes.data.map((p) => p.id);
    const { data: levels } = await supabase
      .from("stock_levels")
      .select("product_id, qty")
      .eq("organization_id", organizationId)
      .eq("warehouse_id", warehouseId)
      .in("product_id", productIds);
    stockMap = new Map((levels || []).map((l) => [l.product_id, Number(l.qty) || 0]));
  }

  const products: PosBootstrapProduct[] = (productsRes.data || []).map((p) => {
    const rawUnit = p.units as { code: string; name: string } | { code: string; name: string }[] | null;
    const unit = Array.isArray(rawUnit) ? rawUnit[0] : rawUnit;
    const meta = (p.metadata || {}) as Record<string, unknown>;
    const tracks = Boolean(p.effective_tracks_stock);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      sell_price: Number(p.sell_price) || 0,
      category_id: p.category_id,
      category_name: p.category_name,
      unit_code: unit?.code || "PCS",
      unit_name: unit?.name || unit?.code || "PCS",
      effective_tracks_stock: tracks,
      effective_product_kind: String(p.effective_product_kind || "goods"),
      stock_qty: tracks && warehouseId ? (stockMap.get(p.id) ?? 0) : null,
      tax_taxable: productTaxableFromMetadata(meta)
    };
  });

  const taxConfig = getActiveTaxConfig(taxSettings);
  const kasBank = (kasRes.data || []).map((k) => ({
    id: k.id,
    code: k.code,
    name: k.name,
    bankDisplay: formatKasBankForInvoice(k)
  }));

  const defaultKas = kasBank.find((k) => /kas/i.test(k.name)) || kasBank[0] || null;

  return {
    organizationId,
    syncedAt: new Date().toISOString(),
    orgName: orgRes.data?.name || "",
    businessSectors: (orgRes.data?.business_sectors as string[]) || ["retail"],
    warehouse: warehouse
      ? { id: warehouse.id, code: warehouse.code, name: warehouse.name }
      : null,
    walkInCustomerId,
    customers: customersRes.data || [],
    categories: categoriesRes.data || [],
    products,
    kasBank,
    defaultKasRekening: defaultKas?.name || "",
    outlets: outletBootstrap,
    tax: taxConfig
      ? {
          active: true,
          taxType: taxConfig.taxType,
          taxLabel: taxTypeLabel(taxConfig.taxType),
          ratePercent: taxConfig.ratePercent,
          priceIncludesTax: taxConfig.priceIncludesTax
        }
      : { active: false }
  };
}
