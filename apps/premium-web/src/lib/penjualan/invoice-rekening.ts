import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatKasBankForInvoice,
  type KasBankAccountDisplay
} from "@/lib/org/kas-bank-display";
import { resolvePrintSettings } from "@/lib/org/print-settings";

export function invoiceNeedsPrintRekening(grandTotal: number, bayar: number): boolean {
  const sisa = Math.max(0, grandTotal - bayar);
  return sisa > 0.01;
}

export async function resolveInvoiceBankInfo(
  supabase: SupabaseClient,
  orgId: string,
  accountId: string
): Promise<string> {
  const { data: account, error } = await supabase
    .from("cash_bank_accounts")
    .select("id, name, code, metadata")
    .eq("id", accountId)
    .eq("organization_id", orgId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!account) throw new Error("Rekening invoice tidak ditemukan");

  const formatted = formatKasBankForInvoice(account as KasBankAccountDisplay);
  if (formatted !== account.name) return formatted;

  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", orgId)
    .maybeSingle();

  const orgBank = resolvePrintSettings(settingsRow?.settings as { print?: Record<string, unknown> })
    .invoiceBankInfo;
  if (orgBank) {
    const line = orgBank
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().includes(account.name.toLowerCase()));
    if (line) return line;
    return orgBank;
  }

  return account.name;
}
