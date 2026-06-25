import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalLineDraft } from "./journal-rules";
import { postJournalEntry } from "./journal-supabase";
import { insertLinkedKeluarMutasi, linkedMutasiTransactionId } from "./linked-mutasi";
import type { KasBankAccountRef } from "./linked-mutasi";

export type CicilanBankInput = {
  organizationId: string;
  entryDate: string;
  account: KasBankAccountRef;
  utangAccountName: string;
  bebanAccountName: string;
  pokok: number;
  bunga: number;
  keterangan: string;
  transactionId: string;
  docNo: string;
};

export function validateCicilanBankInput(input: {
  pokok: number;
  bunga: number;
  utangAccountName: string;
  bebanAccountName: string;
  accountId: string;
}): { ok: boolean; error?: string } {
  const pokok = Number(input.pokok) || 0;
  const bunga = Number(input.bunga) || 0;

  if (!input.accountId) return { ok: false, error: "Rekening bank wajib dipilih" };
  if (!input.utangAccountName.trim()) return { ok: false, error: "Akun utang wajib dipilih" };
  if (!input.bebanAccountName.trim()) return { ok: false, error: "Akun beban bunga wajib dipilih" };
  if (pokok < 0 || bunga < 0) return { ok: false, error: "Pokok dan bunga tidak boleh negatif" };
  if (pokok === 0 && bunga === 0) return { ok: false, error: "Isi pokok dan/atau bunga" };

  return { ok: true };
}

export function buildCicilanBankJournalLines(input: CicilanBankInput): JournalLineDraft[] {
  const pokok = Number(input.pokok) || 0;
  const bunga = Number(input.bunga) || 0;
  const total = pokok + bunga;
  const ket = input.keterangan || "Cicilan pinjaman bank";
  const lines: JournalLineDraft[] = [];

  if (pokok > 0) {
    lines.push({
      lineDate: input.entryDate,
      accountName: input.utangAccountName,
      debit: pokok,
      credit: 0,
      keterangan: `${ket} — pokok`
    });
  }

  if (bunga > 0) {
    lines.push({
      lineDate: input.entryDate,
      accountName: input.bebanAccountName,
      debit: bunga,
      credit: 0,
      keterangan: `${ket} — bunga`
    });
  }

  lines.push({
    lineDate: input.entryDate,
    accountName: input.account.coa_account_name,
    debit: 0,
    credit: total,
    keterangan: ket
  });

  return lines;
}

export async function postCicilanBankPayment(
  supabase: SupabaseClient,
  input: CicilanBankInput
): Promise<{ entryId: string; total: number }> {
  const pokok = Number(input.pokok) || 0;
  const bunga = Number(input.bunga) || 0;
  const total = pokok + bunga;
  const lines = buildCicilanBankJournalLines(input);

  const result = await postJournalEntry(
    supabase,
    {
      organizationId: input.organizationId,
      modul: "CICILAN_UTANG_BANK",
      transactionId: input.transactionId,
      docNo: input.docNo,
      entryDate: input.entryDate,
      sourceDocType: "CICILAN_BANK",
      metadata: {
        pokok,
        bunga,
        total,
        rekening: input.account.name,
        utangAccount: input.utangAccountName,
        bebanAccount: input.bebanAccountName,
        keterangan: input.keterangan
      }
    },
    lines
  );

  await insertLinkedKeluarMutasi(supabase, {
    organizationId: input.organizationId,
    transferDate: input.entryDate,
    account: input.account,
    counterpartyLabel: input.utangAccountName,
    amount: total,
    keterangan: input.keterangan,
    transactionId: linkedMutasiTransactionId("CB", input.transactionId),
    sourceType: "CICILAN_BANK",
    sourceId: result.entryId,
    journalHandledBy: "CICILAN_UTANG_BANK"
  });

  return { entryId: result.entryId, total };
}
