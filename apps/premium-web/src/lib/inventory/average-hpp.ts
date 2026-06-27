/**
 * HPP rata-rata tertimbang (weighted average cost) per produk — org-wide.
 * Stok dijumlahkan dari semua gudang; HPP disimpan di products.metadata.hpp.
 */

export function computeWeightedAverageHpp(
  currentQty: number,
  currentHpp: number,
  incomingQty: number,
  incomingUnitHpp: number
): number {
  const inQ = Math.max(0, Number(incomingQty) || 0);
  const inCost = Math.max(0, Number(incomingUnitHpp) || 0);
  if (inQ <= 0) return Math.max(0, Math.round(currentHpp));
  if (inCost <= 0) return Math.max(0, Math.round(currentHpp));

  const oldQ = Math.max(0, Number(currentQty) || 0);
  const oldCost = Math.max(0, Number(currentHpp) || 0);
  if (oldQ <= 0) return Math.max(0, Math.round(inCost));

  const totalValue = oldQ * oldCost + inQ * inCost;
  const totalQty = oldQ + inQ;
  return Math.max(0, Math.round(totalValue / totalQty));
}

/** Balik efek satu batch pembelian dari rata-rata saat ini (sebelum stok dikurangi). */
export function reverseWeightedAverageHpp(
  currentQty: number,
  currentHpp: number,
  removedQty: number,
  removedUnitHpp: number
): number {
  const remQ = Math.max(0, Number(removedQty) || 0);
  const remCost = Math.max(0, Number(removedUnitHpp) || 0);
  if (remQ <= 0) return Math.max(0, Math.round(currentHpp));

  const curQ = Math.max(0, Number(currentQty) || 0);
  const curCost = Math.max(0, Number(currentHpp) || 0);
  const newQty = curQ - remQ;

  if (newQty <= 0) return Math.max(0, Math.round(curCost));

  const totalValue = curQ * curCost - remQ * remCost;
  if (totalValue <= 0) return Math.max(0, Math.round(curCost));

  return Math.max(0, Math.round(totalValue / newQty));
}

export type PurchaseHppBatch = {
  productId: string;
  qty: number;
  unitHpp: number;
};

/** Gabungkan beberapa baris PO untuk produk yang sama jadi satu batch masuk/keluar. */
export function aggregatePurchaseHppBatches(
  lines: Array<{ productId: string; qty: number; unitHpp: number }>
): PurchaseHppBatch[] {
  const map = new Map<string, { qty: number; value: number }>();

  for (const line of lines) {
    const productId = line.productId;
    const qty = Math.max(0, Number(line.qty) || 0);
    const unitHpp = Math.max(0, Number(line.unitHpp) || 0);
    if (!productId || qty <= 0 || unitHpp <= 0) continue;

    const prev = map.get(productId) || { qty: 0, value: 0 };
    map.set(productId, {
      qty: prev.qty + qty,
      value: prev.value + qty * unitHpp
    });
  }

  return [...map.entries()].map(([productId, agg]) => ({
    productId,
    qty: agg.qty,
    unitHpp: agg.qty > 0 ? Math.round(agg.value / agg.qty) : 0
  }));
}
