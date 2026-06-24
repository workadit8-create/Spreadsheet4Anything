import type { PaymentStatus } from "./types";

export type LinePaymentSlice = {
  bayar: number;
  kurangBayar: number;
  paymentStatus: PaymentStatus;
};

export function computeLineTotal(qty: number, unitPrice: number, diskon = 0): number {
  const total = qty * unitPrice - diskon;
  return Math.max(0, Math.round(total * 100) / 100);
}

/** Alokasi bayar per baris — sama seperti persistInvoice_ di GAS hybrid. */
export function allocatePaymentAcrossLines(
  lineTotals: number[],
  totalBayar: number
): LinePaymentSlice[] {
  let sisaBayar = Math.max(0, totalBayar);
  return lineTotals.map((lineTotal) => {
    const bayarItem = Math.min(sisaBayar, lineTotal);
    const kurangBayar = Math.max(0, lineTotal - bayarItem);
    sisaBayar -= bayarItem;
    const paymentStatus: PaymentStatus =
      kurangBayar > 0 ? "PENJUALAN KREDIT" : "PENJUALAN TUNAI";
    return { bayar: bayarItem, kurangBayar, paymentStatus };
  });
}

export function deriveOrderPaymentStatus(slices: LinePaymentSlice[]): PaymentStatus {
  if (!slices.length) return "PENJUALAN TUNAI";
  return slices.some((s) => s.paymentStatus === "PENJUALAN KREDIT")
    ? "PENJUALAN KREDIT"
    : "PENJUALAN TUNAI";
}

export function buildKeteranganSummary(customerName: string, productNames: string[]): string {
  const unique = [...new Set(productNames.filter(Boolean))];
  if (!unique.length) return customerName;
  if (unique.length <= 2) return `${customerName} — ${unique.join(", ")}`;
  return `${customerName} — ${unique.slice(0, 2).join(", ")} +${unique.length - 2}`;
}
