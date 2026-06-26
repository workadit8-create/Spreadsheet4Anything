import type { TaxActiveType, TaxSettings } from "@/lib/org/tax-settings";
import { isProductTaxEnabled } from "@/lib/org/tax-settings";

export const TAX_OUTPUT_ACCOUNT = "Utang Pajak";
export const TAX_INPUT_ACCOUNT = "PPN Masukan";

export function roundMoney(amount: number): number {
  return Math.max(0, Math.round(amount * 100) / 100);
}

export type ActiveTaxConfig = {
  ratePercent: number;
  priceIncludesTax: boolean;
  taxType: TaxActiveType;
};

export function getActiveTaxConfig(settings: TaxSettings): ActiveTaxConfig | null {
  if (!isProductTaxEnabled(settings)) return null;
  if (settings.activeType === "ppn") {
    return {
      ratePercent: settings.ppn.ratePercent,
      priceIncludesTax: settings.ppn.priceIncludesTax,
      taxType: "ppn"
    };
  }
  if (settings.activeType === "pb") {
    return {
      ratePercent: settings.pb.ratePercent,
      priceIncludesTax: settings.pb.priceIncludesTax,
      taxType: "pb"
    };
  }
  return null;
}

export function taxTypeLabel(taxType: TaxActiveType | null | undefined): string {
  if (taxType === "pb") return "PB";
  if (taxType === "ppn") return "PPN";
  return "Pajak";
}

export type LineTaxResult = {
  dpp: number;
  taxAmount: number;
  gross: number;
  taxable: boolean;
  taxRate: number;
  taxType: TaxActiveType | null;
};

export function computeLineTax(
  netAmount: number,
  taxable: boolean,
  ratePercent: number,
  priceIncludesTax: boolean,
  taxType: TaxActiveType | null = null
): LineTaxResult {
  const base = Math.max(0, netAmount);
  if (!taxable || ratePercent <= 0) {
    return {
      dpp: roundMoney(base),
      taxAmount: 0,
      gross: roundMoney(base),
      taxable: false,
      taxRate: 0,
      taxType: null
    };
  }

  const rate = ratePercent / 100;
  if (priceIncludesTax) {
    const gross = roundMoney(base);
    const dpp = roundMoney(gross / (1 + rate));
    const taxAmount = roundMoney(gross - dpp);
    return { dpp, taxAmount, gross, taxable: true, taxRate: ratePercent, taxType };
  }

  const dpp = roundMoney(base);
  const taxAmount = roundMoney(dpp * rate);
  const gross = roundMoney(dpp + taxAmount);
  return { dpp, taxAmount, gross, taxable: true, taxRate: ratePercent, taxType };
}

export type DocumentTaxSummary = {
  subtotalDpp: number;
  taxTotal: number;
  grandTotal: number;
};

export function summarizeLineTax(lines: LineTaxResult[]): DocumentTaxSummary {
  const subtotalDpp = roundMoney(lines.reduce((sum, l) => sum + l.dpp, 0));
  const taxTotal = roundMoney(lines.reduce((sum, l) => sum + l.taxAmount, 0));
  const grandTotal = roundMoney(lines.reduce((sum, l) => sum + l.gross, 0));
  return { subtotalDpp, taxTotal, grandTotal };
}
