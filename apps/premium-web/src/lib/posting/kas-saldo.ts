import { lineBayar as purchaseLineBayar } from "./hutang";
import { computeSaldoByAccountName, type CashTransferRow, type KasBankAccount } from "./mutasi";
import { lineBayar as salesLineBayar } from "./piutang";
import type { PurchaseLineRow, SalesLineRow } from "./types";

type PaymentRow = {
  doc_type: string;
  doc_id: string;
  amount: number;
  status?: string | null;
  method?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OrderWithLines<TLine> = {
  id: string;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  lines: TLine[];
};

function isVoidedPayment(p: PaymentRow): boolean {
  return String(p.status || "").toUpperCase() === "VOIDED";
}

function isVoidedOrder(status: string | null | undefined): boolean {
  return String(status || "").toUpperCase() === "VOIDED";
}

/** Cocokkan string rekening ke nama akun kas/bank di master. */
export function resolveKasAccountName(
  rekening: string,
  accounts: KasBankAccount[]
): string | null {
  const key = String(rekening || "").trim();
  if (!key) return null;

  const exact = accounts.find((a) => a.name === key || a.coa_account_name === key);
  if (exact) return exact.name;

  const lower = key.toLowerCase();
  const fuzzy = accounts.find(
    (a) => a.name.toLowerCase() === lower || a.coa_account_name.toLowerCase() === lower
  );
  return fuzzy?.name ?? null;
}

function adjustSaldo(saldo: Record<string, number>, accountName: string | null, delta: number) {
  if (!accountName || saldo[accountName] == null || !delta) return;
  saldo[accountName] += delta;
}

function sumPurchaseLineBayar(lines: PurchaseLineRow[]): number {
  return lines.reduce((sum, line) => sum + purchaseLineBayar(line), 0);
}

function sumSalesLineBayar(lines: SalesLineRow[]): number {
  return lines.reduce((sum, line) => sum + salesLineBayar(line), 0);
}

/**
 * Saldo kas/bank = mutasi manual + pembayaran pembelian/penjualan/pelunasan (parity GAS MUTASI_DANA).
 */
export function computeFullKasSaldo(
  accounts: KasBankAccount[],
  transfers: CashTransferRow[],
  purchaseOrders: OrderWithLines<PurchaseLineRow>[],
  salesOrders: OrderWithLines<SalesLineRow>[],
  payments: PaymentRow[]
): Record<string, number> {
  const saldo = computeSaldoByAccountName(accounts, transfers);

  const utangByOrder = new Map<string, number>();
  const piutangByOrder = new Map<string, number>();

  for (const p of payments) {
    if (isVoidedPayment(p)) continue;
    const amount = Number(p.amount) || 0;
    if (amount <= 0) continue;

    const meta = (p.metadata || {}) as Record<string, unknown>;
    const rekening = resolveKasAccountName(String(meta.rekening || p.method || ""), accounts);
    if (!rekening) continue;

    if (p.doc_type === "UTANG_PAYMENT") {
      utangByOrder.set(p.doc_id, (utangByOrder.get(p.doc_id) || 0) + amount);
      adjustSaldo(saldo, rekening, -amount);
    } else if (p.doc_type === "PIUTANG_PAYMENT") {
      piutangByOrder.set(p.doc_id, (piutangByOrder.get(p.doc_id) || 0) + amount);
      adjustSaldo(saldo, rekening, amount);
    }
  }

  for (const order of purchaseOrders) {
    if (isVoidedOrder(order.status)) continue;
    const meta = (order.metadata || {}) as Record<string, unknown>;
    const lineBayarTotal = sumPurchaseLineBayar(order.lines);
    const pelunasanTotal = utangByOrder.get(order.id) || 0;
    const initialBayar = Math.max(0, lineBayarTotal - pelunasanTotal);
    if (initialBayar <= 0) continue;

    const rekening = resolveKasAccountName(String(meta.rekening || ""), accounts);
    adjustSaldo(saldo, rekening, -initialBayar);
  }

  for (const order of salesOrders) {
    if (isVoidedOrder(order.status)) continue;
    const meta = (order.metadata || {}) as Record<string, unknown>;
    const lineBayarTotal = sumSalesLineBayar(order.lines);
    const pelunasanTotal = piutangByOrder.get(order.id) || 0;
    const initialBayar = Math.max(0, lineBayarTotal - pelunasanTotal);
    if (initialBayar <= 0) continue;

    const rekening = resolveKasAccountName(String(meta.rekening || ""), accounts);
    adjustSaldo(saldo, rekening, initialBayar);
  }

  return saldo;
}
