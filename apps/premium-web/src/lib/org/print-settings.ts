export type OrgPrintSettings = {
  invoiceFooter: string;
  invoiceBankInfo: string;
  showPaidStamp: boolean;
};

export const DEFAULT_PRINT_SETTINGS: OrgPrintSettings = {
  invoiceFooter: "Terima kasih atas kepercayaan Anda.",
  invoiceBankInfo: "",
  showPaidStamp: true
};

type SettingsRoot = { print?: Record<string, unknown> } | null | undefined;

export function resolvePrintSettings(settings: SettingsRoot): OrgPrintSettings {
  const print = settings?.print;
  if (!print) return { ...DEFAULT_PRINT_SETTINGS };

  return {
    invoiceFooter: String(
      print.invoice_footer ?? print.invoiceFooter ?? DEFAULT_PRINT_SETTINGS.invoiceFooter
    ).trim() || DEFAULT_PRINT_SETTINGS.invoiceFooter,
    invoiceBankInfo: String(
      print.invoice_bank_info ?? print.invoiceBankInfo ?? ""
    ).trim(),
    showPaidStamp: print.show_paid_stamp !== false && print.showPaidStamp !== false
  };
}

export function buildPrintSettingsPatch(body: Record<string, unknown>): Record<string, unknown> {
  return {
    invoice_footer: String(body.invoice_footer ?? body.invoiceFooter ?? "").trim(),
    invoice_bank_info: String(body.invoice_bank_info ?? body.invoiceBankInfo ?? "").trim(),
    show_paid_stamp: body.show_paid_stamp !== false && body.showPaidStamp !== false
  };
}

export function formatBankInfoFromAccounts(
  accounts: Array<{ name: string; code?: string | null }>
): string {
  const lines = accounts
    .filter((a) => a.name?.trim())
    .map((a) => {
      const code = a.code?.trim();
      return code ? `${a.name.trim()} (${code})` : a.name.trim();
    });
  return lines.join("\n");
}
