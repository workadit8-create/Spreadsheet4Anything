import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const [customersRes, productsRes, kasRes] = await Promise.all([
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
      .select("id, code, name, coa_account_name")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name")
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
      akunPendapatan: String(meta.akunPendapatan || "Pendapatan")
    };
  });

  return NextResponse.json({
    customers: customersRes.data || [],
    products,
    kasBank: kasRes.data || []
  });
}
