/** Flag produk kena pajak — disimpan di products.metadata.taxTaxable (legacy: ppnTaxable) */

import { normalizeOutletCode } from "@/lib/outlets/helpers";

export function productTaxableFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  const meta = metadata || {};
  return (
    meta.taxTaxable === true ||
    meta.tax_taxable === true ||
    meta.ppnTaxable === true ||
    meta.ppn_taxable === true
  );
}

/** @deprecated gunakan productTaxableFromMetadata */
export const productPpnTaxableFromMetadata = productTaxableFromMetadata;

export function mergeProductMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: {
    akunPendapatan?: string;
    taxTaxable?: boolean;
    ppnTaxable?: boolean;
    outlet?: string | null;
  }
): Record<string, unknown> {
  const base = { ...(existing || {}) };
  if (patch.akunPendapatan !== undefined) {
    base.akunPendapatan = patch.akunPendapatan;
  }
  const taxable = patch.taxTaxable ?? patch.ppnTaxable;
  if (taxable !== undefined) {
    base.taxTaxable = taxable;
    base.ppnTaxable = taxable;
  }
  if (patch.outlet !== undefined) {
    const code = String(patch.outlet || "").trim();
    if (code) base.outlet = normalizeOutletCode(code);
    else delete base.outlet;
  }
  return base;
}
