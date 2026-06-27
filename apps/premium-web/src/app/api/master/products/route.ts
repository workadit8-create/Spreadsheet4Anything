import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMasterEntityRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  effectiveTracksStock,
  formatTracksStockLabel,
  tracksStockFromPolicy,
  type StockPolicy
} from "@/lib/products/inventory-policy";
import {
  mergeProductMetadata,
  productTaxableFromMetadata
} from "@/lib/products/ppn";
import {
  parseHppInput,
  productHppFromMetadata,
  resolveFormTrackStock
} from "@/lib/products/product-hpp";
import {
  consignmentSettlementPriceFromMetadata,
  consignmentSupplierIdFromMetadata,
  mergeConsignmentProductMetadata,
  parseStockOwnership,
  productStockOwnership,
  STOCK_OWNERSHIP_LABELS
} from "@/lib/products/consignment-policy";
import { productMatchesOutlet, productOutletCode } from "@/lib/inventory/product-outlet-scope";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";
import {
  fetchOrgTaxSettings,
  isProductTaxEnabled,
  productTaxColumnLabel,
  productTaxFieldLabel
} from "@/lib/org/tax-settings";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const url = new URL(request.url);
  const outletFilter = String(url.searchParams.get("outlet_code") || "").trim();

  const taxSettings = await fetchOrgTaxSettings(supabase, org.id);
  const productTaxEnabled = isProductTaxEnabled(taxSettings);

  const { data: units } = await supabase
    .from("units")
    .select("id, code, name")
    .eq("organization_id", org.id);

  const { data: categories } = await supabase
    .from("product_categories")
    .select("id, code, name, tracks_stock, product_kind")
    .eq("organization_id", org.id)
    .order("sort_order")
    .order("name");

  const addons = await fetchOrgAddons(supabase, org.id);
  const inventoryEnabled = isAddonEnabled(addons, "inventory");
  const titipJualEnabled = isAddonEnabled(addons, "titip_jual");
  let outlets: Array<{ code: string; name: string }> = [];
  if (isAddonEnabled(addons, "outlet")) {
    const outletBootstrap = await fetchOutletBootstrap(supabase, org.id);
    outlets = outletBootstrap.options.map((o) => ({
      code: o.outletCode,
      name: o.label
    }));
  }

  let suppliers: Array<{ id: string; name: string }> = [];
  if (inventoryEnabled) {
    const { data: supplierRows } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name");
    suppliers = (supplierRows || []).map((s) => ({ id: s.id, name: s.name }));
  }

  const outletNameByCode = new Map(outlets.map((o) => [o.code, o.name]));

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, sku, name, sell_price, unit_id, category_id, tracks_stock, product_kind, active, metadata, created_at"
    )
    .eq("organization_id", org.id)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const categoryMap = new Map(
    (categories || []).map((c) => [c.id, c])
  );

  const items = (data || [])
    .map((p) => {
    const cat = p.category_id ? categoryMap.get(p.category_id) : null;
    const categoryTracksStock = cat?.tracks_stock as boolean | null | undefined;
    const effective = effectiveTracksStock(p.tracks_stock, categoryTracksStock);
    const meta = (p.metadata || {}) as Record<string, unknown>;
    const outletCode = productOutletCode(meta);
    return {
      ...p,
      category_name: cat?.name || "",
      category_tracks_stock: categoryTracksStock,
      effective_tracks_stock: effective,
      tracks_stock_label: formatTracksStockLabel(p.tracks_stock, categoryTracksStock),
      stock_policy:
        p.tracks_stock === true
          ? "track"
          : p.tracks_stock === false
            ? "no_track"
            : "inherit",
      outlet: outletCode || "",
      outlet_label: outletCode ? outletNameByCode.get(outletCode) || outletCode : "",
      tax_taxable: productTaxableFromMetadata(
        (p.metadata || {}) as Record<string, unknown>
      ),
      ppn_taxable: productTaxableFromMetadata(
        (p.metadata || {}) as Record<string, unknown>
      ),
      hpp: productHppFromMetadata(meta),
      stock_ownership: productStockOwnership(meta),
      stock_ownership_label: STOCK_OWNERSHIP_LABELS[productStockOwnership(meta)],
      consignment_supplier_id: consignmentSupplierIdFromMetadata(meta),
      consignment_settlement_price: consignmentSettlementPriceFromMetadata(meta)
    };
  })
    .filter((p) =>
      outletFilter
        ? productMatchesOutlet((p.metadata || {}) as Record<string, unknown>, outletFilter)
        : true
    );

  return NextResponse.json({
    items,
    units: units || [],
    categories: categories || [],
    outlets,
    scopedOutletCode: outletFilter || null,
    inventory: { enabled: inventoryEnabled },
    titipJual: { enabled: titipJualEnabled },
    suppliers,
    tax: {
      activeType: taxSettings.activeType,
      productTaxEnabled,
      taxableFieldLabel: productTaxFieldLabel(taxSettings),
      taxColumnLabel: productTaxColumnLabel(taxSettings)
    },
    ppn: { pkpEnabled: taxSettings.ppn.pkpEnabled }
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requireMasterEntityRole(auth.role, "product");
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Nama wajib" }, { status: 400 });

  const sellPrice = Number(body.sell_price);
  if (Number.isNaN(sellPrice) || sellPrice < 0) {
    return NextResponse.json({ error: "Harga tidak valid" }, { status: 400 });
  }

  const stockPolicy = (body.stock_policy as StockPolicy) || "inherit";
  const tracksStock = tracksStockFromPolicy(stockPolicy);

  const taxSettings = await fetchOrgTaxSettings(supabase, org.id);
  const productTaxEnabled = isProductTaxEnabled(taxSettings);

  let existingMeta: Record<string, unknown> = {};
  if (body.id) {
    const { data: existingRow } = await supabase
      .from("products")
      .select("metadata")
      .eq("id", body.id)
      .eq("organization_id", org.id)
      .maybeSingle();
    existingMeta = (existingRow?.metadata || {}) as Record<string, unknown>;
  }

  let taxTaxable = productTaxableFromMetadata(existingMeta);
  if (productTaxEnabled) {
    const bodyTaxable = body.tax_taxable ?? body.ppn_taxable;
    if (bodyTaxable !== undefined) {
      taxTaxable = bodyTaxable === true;
    } else if (!body.id) {
      taxTaxable = true;
    }
  }

  const bodyMeta = (body.metadata || {}) as Record<string, unknown>;
  const outletPatch =
    bodyMeta.outlet !== undefined
      ? String(bodyMeta.outlet || "")
      : body.outlet !== undefined
        ? String(body.outlet || "")
        : undefined;

  const addons = await fetchOrgAddons(supabase, org.id);
  const inventoryEnabled = isAddonEnabled(addons, "inventory");
  const titipJualEnabled = isAddonEnabled(addons, "titip_jual");

  const { data: categories } = await supabase
    .from("product_categories")
    .select("id, tracks_stock")
    .eq("organization_id", org.id);

  const willTrackStock = resolveFormTrackStock(
    stockPolicy,
    body.category_id ? String(body.category_id) : null,
    categories || []
  );

  const stockOwnership = titipJualEnabled
    ? parseStockOwnership(bodyMeta.stockOwnership ?? body.stock_ownership)
    : "owned";

  const hppInput = parseHppInput(bodyMeta.hpp ?? body.hpp);
  const isConsignment =
    titipJualEnabled && inventoryEnabled && willTrackStock && stockOwnership === "consignment";

  if (inventoryEnabled && willTrackStock && !isConsignment && hppInput === null) {
    return NextResponse.json(
      { error: "HPP wajib untuk produk milik sendiri yang kelola stok" },
      { status: 400 }
    );
  }

  let consignmentSupplierId: string | null = null;
  let consignmentSettlementPrice: number | null = null;
  if (isConsignment) {
    consignmentSupplierId = String(
      bodyMeta.consignmentSupplierId ?? body.consignment_supplier_id ?? ""
    ).trim();
    if (!consignmentSupplierId) {
      return NextResponse.json(
        { error: "Supplier pemilik titip wajib untuk produk titip jual" },
        { status: 400 }
      );
    }
    const { data: supplierRow } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", consignmentSupplierId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!supplierRow) {
      return NextResponse.json({ error: "Supplier pemilik titip tidak ditemukan" }, { status: 400 });
    }
    const settlementRaw = bodyMeta.consignmentSettlementPrice ?? body.consignment_settlement_price;
    const settlement = Number(settlementRaw);
    if (!Number.isFinite(settlement) || settlement < 0) {
      return NextResponse.json(
        { error: "Harga settlement titip jual wajib (>= 0)" },
        { status: 400 }
      );
    }
    consignmentSettlementPrice = Math.round(settlement);
  }

  let metadata = mergeProductMetadata(existingMeta, {
    akunPendapatan: String(body.akunPendapatan || existingMeta.akunPendapatan || "Pendapatan").trim(),
    taxTaxable,
    outlet: outletPatch,
    ...(inventoryEnabled && willTrackStock && !isConsignment && hppInput !== null
      ? { hpp: hppInput }
      : {})
  });

  if (titipJualEnabled && inventoryEnabled && willTrackStock) {
    metadata = mergeConsignmentProductMetadata(metadata, {
      stockOwnership,
      consignmentSupplierId: isConsignment ? consignmentSupplierId : null,
      consignmentSettlementPrice: isConsignment ? consignmentSettlementPrice : null
    });
  } else {
    metadata = mergeConsignmentProductMetadata(metadata, { stockOwnership: "owned" });
  }

  if (isAddonEnabled(addons, "outlet")) {
    const outletBootstrap = await fetchOutletBootstrap(supabase, org.id);
    if (outletBootstrap.options.length && !productOutletCode(metadata)) {
      return NextResponse.json({ error: "Outlet wajib dipilih untuk produk multi-outlet" }, { status: 400 });
    }
  }

  const row = {
    organization_id: org.id,
    sku: String(body.sku || "").trim() || null,
    name,
    sell_price: sellPrice,
    unit_id: body.unit_id || null,
    category_id: body.category_id || null,
    tracks_stock: tracksStock,
    product_kind: body.product_kind || null,
    active: body.active !== false,
    metadata
  };

  if (body.id) {
    const { data, error } = await supabase
      .from("products")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("organization_id", org.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  const { data, error } = await supabase.from("products").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
