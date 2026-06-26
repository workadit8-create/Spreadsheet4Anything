/** Flag produk kena pajak — disimpan di products.metadata.taxTaxable (legacy: ppnTaxable) */

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
  return base;
}
