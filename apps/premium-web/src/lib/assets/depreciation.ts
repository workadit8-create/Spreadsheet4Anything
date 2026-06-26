import type { AssetSummary } from "@/lib/assets/types";

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function depreciableBase(acquisitionCost: number, salvageValue: number): number {
  return Math.max(0, roundMoney(acquisitionCost - salvageValue));
}

export function monthlyStraightLineDepreciation(
  acquisitionCost: number,
  salvageValue: number,
  usefulLifeMonths: number
): number {
  if (usefulLifeMonths <= 0) return 0;
  return roundMoney(depreciableBase(acquisitionCost, salvageValue) / usefulLifeMonths);
}

export function summarizeAsset(
  acquisitionCost: number,
  salvageValue: number,
  usefulLifeMonths: number,
  depreciationLogs: Array<{ amount: number }>
): AssetSummary {
  const base = depreciableBase(acquisitionCost, salvageValue);
  const monthlyDepreciation = monthlyStraightLineDepreciation(
    acquisitionCost,
    salvageValue,
    usefulLifeMonths
  );
  const totalDepreciated = roundMoney(
    depreciationLogs.reduce((sum, l) => sum + Number(l.amount) || 0, 0)
  );
  const remainingDepreciable = roundMoney(Math.max(0, base - totalDepreciated));
  const bookValue = roundMoney(Math.max(salvageValue, acquisitionCost - totalDepreciated));

  return {
    monthlyDepreciation,
    totalDepreciated,
    bookValue,
    depreciableBase: base,
    remainingDepreciable
  };
}

/** Jumlah penyusutan periode — default bulanan, tidak melebihi sisa */
export function nextDepreciationAmount(
  summary: AssetSummary,
  requested?: number
): number {
  if (summary.remainingDepreciable <= 0) return 0;
  const base = requested != null && requested > 0 ? requested : summary.monthlyDepreciation;
  return roundMoney(Math.min(base, summary.remainingDepreciable));
}
