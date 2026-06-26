import { normalizeOutletCode } from "@/lib/outlets/helpers";

/** Outlet penjualan produk dari metadata atau prefix SKU (hybrid-lab dummy). */
export function productOutletCode(
  sku: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): string {
  const meta = metadata || {};
  const fromMeta = String(meta.outlet || meta.outlet_code || "").trim();
  if (fromMeta) return normalizeOutletCode(fromMeta);

  const skuUpper = String(sku || "").toUpperCase();
  if (skuUpper.startsWith("MART-")) return "MART";
  if (skuUpper.startsWith("CAFE-")) return "CAFE";
  if (skuUpper.startsWith("FSH-")) return "FASHION";

  const outlets = meta.outlets;
  if (Array.isArray(outlets) && outlets.length === 1) {
    return normalizeOutletCode(String(outlets[0]));
  }

  return "";
}

export function productMatchesOutlet(
  sku: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  outletCode: string | null | undefined
): boolean {
  const target = normalizeOutletCode(outletCode || "");
  if (!target) return true;
  const assigned = productOutletCode(sku, metadata);
  if (!assigned) return false;
  return assigned === target;
}
