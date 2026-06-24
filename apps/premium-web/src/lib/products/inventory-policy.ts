export const BUSINESS_SECTORS = ["retail", "fnb", "manufacturing", "services"] as const;
export type BusinessSector = (typeof BUSINESS_SECTORS)[number];

export const PRODUCT_KINDS = [
  "goods",
  "raw_material",
  "finished_good",
  "menu_item",
  "service"
] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  goods: "Barang dagang",
  raw_material: "Bahan baku",
  finished_good: "Barang jadi",
  menu_item: "Menu F&B",
  service: "Jasa"
};

export const BUSINESS_SECTOR_LABELS: Record<BusinessSector, string> = {
  retail: "Retail",
  fnb: "F&B",
  manufacturing: "Manufaktur",
  services: "Jasa"
};

export type StockPolicy = "inherit" | "track" | "no_track";

export function stockPolicyFromTracksStock(tracksStock: boolean | null | undefined): StockPolicy {
  if (tracksStock === true) return "track";
  if (tracksStock === false) return "no_track";
  return "inherit";
}

export function tracksStockFromPolicy(policy: StockPolicy): boolean | null {
  if (policy === "track") return true;
  if (policy === "no_track") return false;
  return null;
}

export function effectiveTracksStock(
  productTracksStock: boolean | null | undefined,
  categoryTracksStock: boolean | null | undefined
): boolean {
  if (productTracksStock != null) return productTracksStock;
  if (categoryTracksStock != null) return categoryTracksStock;
  return true;
}

export function effectiveProductKind(
  productKind: string | null | undefined,
  categoryKind: string | null | undefined
): ProductKind {
  const kind = productKind || categoryKind || "goods";
  return PRODUCT_KINDS.includes(kind as ProductKind) ? (kind as ProductKind) : "goods";
}

export function formatTracksStockLabel(
  productTracksStock: boolean | null | undefined,
  categoryTracksStock: boolean | null | undefined
): string {
  const effective = effectiveTracksStock(productTracksStock, categoryTracksStock);
  const policy = stockPolicyFromTracksStock(productTracksStock);
  if (policy === "inherit") {
    return effective ? "Stok (dari kategori)" : "Tanpa stok (dari kategori)";
  }
  return effective ? "Stok" : "Tanpa stok";
}
