import { effectiveTracksStock } from "@/lib/products/inventory-policy";

/** Harga pokok per satuan — statis sampai modul pembelian (average cost). */
export function productHppFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): number | null {
  const meta = metadata || {};
  const raw = meta.hpp ?? meta.cost ?? meta.hargaPokok;
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const hpp = Number(raw);
  return Number.isFinite(hpp) && hpp >= 0 ? hpp : null;
}

export function hasProductHpp(metadata: Record<string, unknown> | null | undefined): boolean {
  return productHppFromMetadata(metadata) != null;
}

/** Placeholder HPP untuk produk lama — ~70% harga jual, min Rp 100. */
export function dummyHppFromSellPrice(sellPrice: number): number {
  const price = Number(sellPrice) || 0;
  if (price <= 0) return 100;
  return Math.max(100, Math.floor(price * 0.7));
}

export function resolveFormTrackStock(
  stockPolicy: string | null | undefined,
  categoryId: string | null | undefined,
  categories: Array<{ id: string; tracks_stock?: boolean | null }>
): boolean {
  const policy = String(stockPolicy || "inherit");
  if (policy === "track") return true;
  if (policy === "no_track") return false;
  const cat = categoryId ? categories.find((c) => c.id === categoryId) : null;
  return effectiveTracksStock(null, cat?.tracks_stock);
}

export function parseHppInput(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const hpp = Number(raw);
  if (!Number.isFinite(hpp) || hpp < 0) return null;
  return hpp;
}
