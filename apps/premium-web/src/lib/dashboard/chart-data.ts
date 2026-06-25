import { lastNMonthKeysWib } from "@/lib/date/wib";

export type MonthlyTrendPoint = {
  month: string;
  label: string;
  sales: number;
  purchases: number;
};

export type BalanceSlice = {
  name: string;
  value: number;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function last6MonthKeys(): string[] {
  return lastNMonthKeysWib(6);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const monthIndex = Number(m) - 1;
  return `${MONTH_LABELS[monthIndex] ?? m} ${y.slice(2)}`;
}

export function buildMonthlyTrend(
  salesRows: Array<{ order_date: string; total: number }>,
  purchaseRows: Array<{ order_date: string; total: number }>
): MonthlyTrendPoint[] {
  const keys = last6MonthKeys();
  const salesMap = new Map(keys.map((k) => [k, 0]));
  const purchaseMap = new Map(keys.map((k) => [k, 0]));

  for (const row of salesRows) {
    const key = String(row.order_date).slice(0, 7);
    if (!salesMap.has(key)) continue;
    salesMap.set(key, (salesMap.get(key) || 0) + (Number(row.total) || 0));
  }

  for (const row of purchaseRows) {
    const key = String(row.order_date).slice(0, 7);
    if (!purchaseMap.has(key)) continue;
    purchaseMap.set(key, (purchaseMap.get(key) || 0) + (Number(row.total) || 0));
  }

  return keys.map((month) => ({
    month,
    label: monthLabel(month),
    sales: salesMap.get(month) || 0,
    purchases: purchaseMap.get(month) || 0
  }));
}

export function buildBalanceMix(input: {
  saldoByAccount: Record<string, number>;
  totalPiutang: number;
}): BalanceSlice[] {
  const slices: BalanceSlice[] = [];

  for (const [name, value] of Object.entries(input.saldoByAccount)) {
    const v = Number(value) || 0;
    if (v > 0) slices.push({ name, value: v });
  }

  if (input.totalPiutang > 0) {
    slices.push({ name: "Piutang", value: input.totalPiutang });
  }

  return slices.sort((a, b) => b.value - a.value);
}
