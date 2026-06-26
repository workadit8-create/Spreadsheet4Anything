import { roundMoney } from "@/lib/assets/depreciation";

export type DisposalAmounts = {
  acquisitionCost: number;
  totalDepreciated: number;
  bookValue: number;
  proceeds: number;
  gainLoss: number;
};

export function computeDisposalAmounts(
  acquisitionCost: number,
  totalDepreciated: number,
  proceeds: number,
  salvageValue = 0
): DisposalAmounts {
  const cost = roundMoney(acquisitionCost);
  const accum = roundMoney(totalDepreciated);
  const bookValue = roundMoney(Math.max(salvageValue, cost - accum));
  const sale = roundMoney(Math.max(0, proceeds));
  const gainLoss = roundMoney(sale - bookValue);
  return {
    acquisitionCost: cost,
    totalDepreciated: accum,
    bookValue,
    proceeds: sale,
    gainLoss
  };
}

export const DEFAULT_GAIN_ON_DISPOSAL_COA = "Pendapatan Lain-lain";
export const DEFAULT_LOSS_ON_DISPOSAL_COA = "Beban Lain-lain";
