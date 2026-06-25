import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMutasiDanaJournalLines } from "./journal-rules";
import { postJournalEntry } from "./journal-supabase";

export type MutasiKind = "Transfer" | "Masuk" | "Keluar";

export type KasBankAccount = {
  id: string;
  name: string;
  coa_account_name: string;
  active?: boolean;
};

export type CashTransferRow = {
  id: string;
  organization_id: string;
  transfer_no: string;
  transfer_date: string;
  kind: MutasiKind;
  source_account_id: string | null;
  source_account_name: string | null;
  source_coa_name: string | null;
  dest_account_id: string | null;
  dest_account_name: string | null;
  dest_coa_name: string | null;
  contra_coa_name: string | null;
  amount: number;
  keterangan: string | null;
  transaction_id: string;
  status: string;
};

export type CreateMutasiInput = {
  transfer_date: string;
  kind: MutasiKind;
  source_account_id?: string | null;
  dest_account_id?: string | null;
  contra_coa_name?: string;
  amount: number;
  keterangan?: string;
};

export function validateMutasiInput(
  input: CreateMutasiInput,
  accounts: KasBankAccount[]
): {
  source: KasBankAccount | null;
  dest: KasBankAccount | null;
  contraCoa: string | null;
} {
  const kind = input.kind;
  const amount = Number(input.amount);
  if (!input.transfer_date) throw new Error("Tanggal mutasi wajib diisi");
  if (!amount || amount <= 0) throw new Error("Nominal mutasi harus lebih dari 0");

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const source = input.source_account_id ? byId.get(input.source_account_id) || null : null;
  const dest = input.dest_account_id ? byId.get(input.dest_account_id) || null : null;
  const contraCoa = String(input.contra_coa_name || "").trim() || null;

  if (kind === "Transfer") {
    if (!source) throw new Error("Rekening sumber wajib dipilih");
    if (!dest) throw new Error("Rekening tujuan wajib dipilih");
    if (source.id === dest.id) throw new Error("Rekening sumber dan tujuan tidak boleh sama");
  } else if (kind === "Masuk") {
    if (!dest) throw new Error("Rekening tujuan wajib dipilih untuk setoran");
  } else if (kind === "Keluar") {
    if (!source) throw new Error("Rekening sumber wajib dipilih untuk penarikan");
  }

  return { source, dest, contraCoa };
}

export function computeSaldoByAccountName(
  accounts: KasBankAccount[],
  transfers: CashTransferRow[]
): Record<string, number> {
  const saldo: Record<string, number> = {};
  for (const a of accounts) {
    if (a.active === false) continue;
    saldo[a.name] = 0;
  }

  for (const t of transfers) {
    if (t.status === "VOIDED") continue;
    const nominal = Number(t.amount) || 0;
    if (t.kind === "Transfer") {
      const dari = t.source_account_name || "";
      const ke = t.dest_account_name || "";
      if (dari && saldo[dari] != null) saldo[dari] -= nominal;
      if (ke && saldo[ke] != null) saldo[ke] += nominal;
    } else if (t.kind === "Masuk") {
      const ke = t.dest_account_name || "";
      if (ke && saldo[ke] != null) saldo[ke] += nominal;
    } else if (t.kind === "Keluar") {
      const dari = t.source_account_name || "";
      if (dari && saldo[dari] != null) saldo[dari] -= nominal;
    }
  }

  return saldo;
}

export async function postCashTransferJournal(
  supabase: SupabaseClient,
  transfer: CashTransferRow
): Promise<{ skipped: boolean }> {
  const sumberCoa =
    transfer.kind === "Masuk"
      ? transfer.contra_coa_name || transfer.source_coa_name || ""
      : transfer.source_coa_name || "";
  const tujuanCoa =
    transfer.kind === "Keluar"
      ? transfer.contra_coa_name || transfer.dest_coa_name || ""
      : transfer.dest_coa_name || "";

  if (transfer.kind === "Transfer" && (!sumberCoa || !tujuanCoa)) {
    throw new Error("Akun COA sumber/tujuan tidak lengkap");
  }
  if (transfer.kind === "Masuk" && !tujuanCoa) {
    throw new Error("Akun COA tujuan tidak lengkap");
  }
  if (transfer.kind === "Keluar" && !sumberCoa) {
    throw new Error("Akun COA sumber tidak lengkap");
  }

  const lines = buildMutasiDanaJournalLines({
    tanggal: transfer.transfer_date,
    transactionId: transfer.transaction_id,
    jenis: transfer.kind,
    sumberCoa,
    tujuanCoa,
    nominal: Number(transfer.amount) || 0,
    keterangan: String(transfer.keterangan || "")
  });

  const result = await postJournalEntry(
    supabase,
    {
      organizationId: transfer.organization_id,
      modul: "MUTASI_DANA",
      transactionId: transfer.transaction_id,
      docNo: transfer.transfer_no,
      entryDate: transfer.transfer_date,
      sourceDocType: "CASH_TRANSFER",
      sourceDocId: transfer.id
    },
    lines
  );

  return { skipped: result.skipped };
}
