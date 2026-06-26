const ACCUM_BY_ASSET: Record<string, string> = {
  Peralatan: "Akumulasi Penyusutan Peralatan"
};

export function defaultAccumCoaForAsset(assetCoa: string): string {
  if (ACCUM_BY_ASSET[assetCoa]) return ACCUM_BY_ASSET[assetCoa];
  if (/akumulasi/i.test(assetCoa)) return assetCoa;
  return `Akumulasi Penyusutan ${assetCoa}`;
}

export function defaultDepreciationExpenseCoa(available: string[]): string {
  if (available.includes("Beban Penyusutan")) return "Beban Penyusutan";
  if (available.includes("Beban Administrasi")) return "Beban Administrasi";
  return available[0] || "Beban Penyusutan";
}

export function isAccumCoaName(name: string): boolean {
  return /akumulasi/i.test(name);
}

export function isFixedAssetCoaName(
  name: string,
  coaSubCategoryByName?: Map<string, string>
): boolean {
  if (!name || isAccumCoaName(name)) return false;
  const sub = coaSubCategoryByName?.get(name);
  if (sub === "Aset Tetap") return true;
  return /^(peralatan|mesin|kendaraan|gedung|tanah)\b/i.test(name);
}

export function assetCategoryFromCoa(assetCoa: string): string {
  const lower = assetCoa.toLowerCase();
  if (lower.includes("kendaraan")) return "Kendaraan";
  if (lower.includes("mesin")) return "Mesin";
  if (lower.includes("gedung")) return "Gedung";
  return "Peralatan";
}

export function resolvePurchaseAssetCoa(
  categoryCoa: string,
  subByName: Map<string, string>,
  assetAccounts: string[]
): string {
  if (isFixedAssetCoaName(categoryCoa, subByName)) return categoryCoa;
  if (assetAccounts.includes("Peralatan")) return "Peralatan";
  return assetAccounts.find((a) => !isAccumCoaName(a)) || categoryCoa;
}
