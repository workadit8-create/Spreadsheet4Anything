/** Supplier terdaftar PKP — PPN masukan bisa dikreditkan di pembelian */

export function supplierPkpFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  const meta = metadata || {};
  return meta.pkp === true || meta.is_pkp === true || meta.isPkp === true;
}

export function mergeSupplierMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: { pkp?: boolean }
): Record<string, unknown> {
  const base = { ...(existing || {}) };
  if (patch.pkp !== undefined) {
    base.pkp = patch.pkp;
  }
  return base;
}
