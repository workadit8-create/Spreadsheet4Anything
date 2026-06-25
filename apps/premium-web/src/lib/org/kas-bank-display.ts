export type KasBankAccountDisplay = {
  id: string;
  name: string;
  code?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function formatKasBankForInvoice(account: KasBankAccountDisplay): string {
  const meta = account.metadata || {};
  const bank = String(meta.bank_name || meta.bankName || "").trim();
  const accountNo = String(meta.account_no || meta.accountNo || "").trim();
  const holder = String(meta.account_holder || meta.accountHolder || "").trim();

  if (bank && accountNo) {
    return holder ? `${bank} ${accountNo} a.n. ${holder}` : `${bank} ${accountNo}`;
  }
  if (accountNo) {
    return holder ? `${accountNo} a.n. ${holder}` : accountNo;
  }
  return account.name;
}

export function kasBankOptionLabel(account: KasBankAccountDisplay): string {
  const display = formatKasBankForInvoice(account);
  if (display !== account.name) {
    return `${account.name} — ${display}`;
  }
  return account.name;
}
