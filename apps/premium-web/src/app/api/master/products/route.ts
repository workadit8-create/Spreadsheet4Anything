import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMasterEntityRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  effectiveTracksStock,
  formatTracksStockLabel,
  tracksStockFromPolicy,
  type StockPolicy
} from "@/lib/products/inventory-policy";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

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

  const items = (data || []).map((p) => {
    const cat = p.category_id ? categoryMap.get(p.category_id) : null;
    const categoryTracksStock = cat?.tracks_stock as boolean | null | undefined;
    const effective = effectiveTracksStock(p.tracks_stock, categoryTracksStock);
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
            : "inherit"
    };
  });

  return NextResponse.json({
    items,
    units: units || [],
    categories: categories || []
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

  const metadata = {
    akunPendapatan: String(body.akunPendapatan || "Pendapatan").trim()
  };

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
