/** Flag produk kena PPN — disimpan di products.metadata.ppnTaxable */

export function productPpnTaxableFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  const meta = metadata || {};
  return meta.ppnTaxable === true || meta.ppn_taxable === true;
}

export function mergeProductMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: {
    akunPendapatan?: string;
    ppnTaxable?: boolean;
  }
): Record<string, unknown> {
  const base = { ...(existing || {}) };
  if (patch.akunPendapatan !== undefined) {
    base.akunPendapatan = patch.akunPendapatan;
  }
  if (patch.ppnTaxable !== undefined) {
    base.ppnTaxable = patch.ppnTaxable;
  }
  return base;
}
