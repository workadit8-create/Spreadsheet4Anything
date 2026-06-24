import type { PembelianMetode } from "./types";

export type PurchaseLinePaymentSlice = {
  bayar: number;
  kurangBayar: number;
  metode: PembelianMetode;
};

export function computePurchaseLineTotal(qty: number, unitCost: number, diskon = 0): number {
  const total = qty * unitCost - diskon;
  return Math.max(0, Math.round(total * 100) / 100);
}

export function allocatePaymentAcrossPurchaseLines(
  lineTotals: number[],
  totalBayar: number
): PurchaseLinePaymentSlice[] {
  let sisaBayar = Math.max(0, totalBayar);
  return lineTotals.map((lineTotal) => {
    const bayarItem = Math.min(sisaBayar, lineTotal);
    const kurangBayar = Math.max(0, lineTotal - bayarItem);
    sisaBayar -= bayarItem;
    const metode: PembelianMetode = kurangBayar > 0 ? "Kredit" : "Tunai";
    return { bayar: bayarItem, kurangBayar, metode };
  });
}

export function deriveOrderPembelianMetode(slices: PurchaseLinePaymentSlice[]): PembelianMetode {
  if (!slices.length) return "Tunai";
  return slices.some((s) => s.metode === "Kredit") ? "Kredit" : "Tunai";
}

export function buildPembelianKeterangan(supplierName: string, descriptions: string[]): string {
  const unique = [...new Set(descriptions.filter(Boolean))];
  if (!unique.length) return supplierName;
  if (unique.length <= 2) return `${supplierName} — ${unique.join(", ")}`;
  return `${supplierName} — ${unique.slice(0, 2).join(", ")} +${unique.length - 2}`;
}
