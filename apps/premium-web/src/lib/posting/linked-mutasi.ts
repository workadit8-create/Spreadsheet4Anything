import type { SupabaseClient } from "@supabase/supabase-js";
import { generateMutasiTransferNo } from "./ids";

export type LinkedSourceType =
  | "PURCHASE_ORDER"
  | "SALES_ORDER"
  | "UTANG_PAYMENT"
  | "PIUTANG_PAYMENT"
  | "CICILAN_BANK"
  | "ASSET_DISPOSAL"
  | "CONSIGNMENT_SETTLEMENT";

export type KasBankAccountRef = {
  id: string;
  name: string;
  coa_account_name: string;
};

export type LinkedMutasiMetadata = {
  linked: true;
  sourceType: LinkedSourceType;
  sourceId: string;
  sourceLineId?: string;
  journalHandledBy: string;
};

export function resolveKasBankAccount(
  rekening: string,
  accounts: KasBankAccountRef[]
): KasBankAccountRef | null {
  const key = String(rekening || "").trim();
  if (!key) return null;

  const exact = accounts.find((a) => a.name === key || a.coa_account_name === key);
  if (exact) return exact;

  const lower = key.toLowerCase();
  return (
    accounts.find(
      (a) => a.name.toLowerCase() === lower || a.coa_account_name.toLowerCase() === lower
    ) || null
  );
}

export function isLinkedCashTransfer(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.linked === true;
}

export function isOpeningBalanceTransfer(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  return metadata?.opening_balance === true;
}

export function linkedMutasiTransactionId(prefix: string, key: string): string {
  const safe = String(key).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return `LINK-${prefix}-${safe}`;
}

type InsertLinkedInput = {
  organizationId: string;
  transferDate: string;
  kind: "Masuk" | "Keluar";
  account: KasBankAccountRef;
  counterpartyLabel: string;
  amount: number;
  keterangan: string;
  transactionId: string;
  sourceType: LinkedSourceType;
  sourceId: string;
  sourceLineId?: string;
  journalHandledBy: string;
};

async function insertLinkedMutasi(
  supabase: SupabaseClient,
  input: InsertLinkedInput
): Promise<void> {
  const amount = Number(input.amount) || 0;
  if (amount <= 0) return;

  const meta: LinkedMutasiMetadata = {
    linked: true,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    journalHandledBy: input.journalHandledBy
  };
  if (input.sourceLineId) meta.sourceLineId = input.sourceLineId;

  const isKeluar = input.kind === "Keluar";
  const row = {
    organization_id: input.organizationId,
    transfer_no: generateMutasiTransferNo(),
    transfer_date: input.transferDate,
    kind: input.kind,
    source_account_id: isKeluar ? input.account.id : null,
    source_account_name: isKeluar ? input.account.name : null,
    source_coa_name: isKeluar ? input.account.coa_account_name : null,
    dest_account_id: isKeluar ? null : input.account.id,
    dest_account_name: isKeluar ? input.counterpartyLabel : input.account.name,
    dest_coa_name: isKeluar ? null : input.account.coa_account_name,
    contra_coa_name: isKeluar ? input.counterpartyLabel : null,
    amount,
    keterangan: input.keterangan,
    transaction_id: input.transactionId,
    status: "POSTED",
    metadata: meta
  };

  const { error } = await supabase.from("cash_transfers").insert(row);
  if (error && !error.message.includes("duplicate key")) {
    throw new Error(error.message);
  }
}

export async function insertLinkedKeluarMutasi(
  supabase: SupabaseClient,
  input: Omit<InsertLinkedInput, "kind">
): Promise<void> {
  await insertLinkedMutasi(supabase, { ...input, kind: "Keluar" });
}

export async function insertLinkedMasukMutasi(
  supabase: SupabaseClient,
  input: Omit<InsertLinkedInput, "kind">
): Promise<void> {
  await insertLinkedMutasi(supabase, { ...input, kind: "Masuk" });
}

/** Alokasi saldo awal ke rekening master — jurnal sudah lewat Jurnal Manual, tanpa MUTASI_DANA. */
export async function insertOpeningBalanceMutasi(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    transferDate: string;
    account: KasBankAccountRef;
    amount: number;
    keterangan?: string;
    transactionId: string;
  }
): Promise<void> {
  const amount = Number(input.amount) || 0;
  if (amount <= 0) return;

  const row = {
    organization_id: input.organizationId,
    transfer_no: generateMutasiTransferNo(),
    transfer_date: input.transferDate,
    kind: "Masuk" as const,
    source_account_id: null,
    source_account_name: null,
    source_coa_name: null,
    dest_account_id: input.account.id,
    dest_account_name: input.account.name,
    dest_coa_name: input.account.coa_account_name,
    contra_coa_name: null,
    amount,
    keterangan: input.keterangan || `Saldo awal ${input.account.name}`,
    transaction_id: input.transactionId,
    status: "POSTED",
    metadata: {
      linked: true,
      opening_balance: true,
      journalHandledBy: "MANUAL_JOURNAL"
    }
  };

  const { error } = await supabase.from("cash_transfers").insert(row);
  if (error && !error.message.includes("duplicate key")) {
    throw new Error(error.message);
  }
}

export async function voidLinkedMutasiBySource(
  supabase: SupabaseClient,
  organizationId: string,
  sourceType: LinkedSourceType,
  sourceId: string,
  userId?: string,
  reason?: string
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("cash_transfers")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("metadata->>sourceType", sourceType)
    .eq("metadata->>sourceId", sourceId)
    .neq("status", "VOIDED");

  if (error) throw new Error(error.message);

  for (const row of rows || []) {
    await supabase
      .from("cash_transfers")
      .update({
        status: "VOIDED",
        voided_at: new Date().toISOString(),
        void_reason: reason?.trim() || "Dibatalkan dari dokumen sumber",
        voided_by: userId || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id);
  }
}

export async function deleteLinkedMutasiBySource(
  supabase: SupabaseClient,
  organizationId: string,
  sourceType: LinkedSourceType,
  sourceId: string
): Promise<void> {
  const { error } = await supabase
    .from("cash_transfers")
    .delete()
    .eq("organization_id", organizationId)
    .eq("metadata->>sourceType", sourceType)
    .eq("metadata->>sourceId", sourceId);

  if (error) throw new Error(error.message);
}
