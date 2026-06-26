import type { SupabaseClient } from "@supabase/supabase-js";

export type StokMinusRow = {
  productId: string;
  productName: string;
  sku: string | null;
  warehouseId: string;
  warehouseName: string;
  qty: number;
};

export type StokMinusReport = {
  asOf: string;
  rows: StokMinusRow[];
};

export async function buildStokMinusReport(
  supabase: SupabaseClient,
  organizationId: string
): Promise<StokMinusReport> {
  const { data: levels, error } = await supabase
    .from("stock_levels")
    .select("product_id, warehouse_id, qty, products(name, sku), warehouses(name)")
    .eq("organization_id", organizationId)
    .lt("qty", 0)
    .order("qty", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows: StokMinusRow[] = (levels || []).map((row) => {
    const rawProduct = row.products as
      | { name: string; sku: string | null }
      | { name: string; sku: string | null }[]
      | null;
    const rawWarehouse = row.warehouses as { name: string } | { name: string }[] | null;
    const product = Array.isArray(rawProduct) ? rawProduct[0] : rawProduct;
    const warehouse = Array.isArray(rawWarehouse) ? rawWarehouse[0] : rawWarehouse;
    return {
      productId: row.product_id,
      productName: product?.name || "—",
      sku: product?.sku || null,
      warehouseId: row.warehouse_id,
      warehouseName: warehouse?.name || "—",
      qty: Number(row.qty) || 0
    };
  });

  return {
    asOf: new Date().toISOString(),
    rows
  };
}
