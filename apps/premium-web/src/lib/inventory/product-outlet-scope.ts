import { normalizeOutletCode } from "@/lib/outlets/helpers";

/** Outlet penjualan produk — hanya dari metadata (bukan prefix SKU/barcode). */
export function productOutletCode(metadata: Record<string, unknown> | null | undefined): string {
  const meta = metadata || {};
  const fromMeta = String(meta.outlet || meta.outlet_code || "").trim();
  if (fromMeta) return normalizeOutletCode(fromMeta);

  const outlets = meta.outlets;
  if (Array.isArray(outlets) && outlets.length === 1) {
    return normalizeOutletCode(String(outlets[0]));
  }

  return "";
}

export function productMatchesOutlet(
  metadata: Record<string, unknown> | null | undefined,
  outletCode: string | null | undefined
): boolean {
  const target = normalizeOutletCode(outletCode || "");
  if (!target) return true;
  const assigned = productOutletCode(metadata);
  if (!assigned) return false;
  return assigned === target;
}
