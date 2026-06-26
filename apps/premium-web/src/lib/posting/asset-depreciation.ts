import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalLineDraft } from "./journal-rules";
import { postJournalEntry } from "./journal-supabase";

export type AssetDepreciationPostInput = {
  organizationId: string;
  fixedAssetId: string;
  assetName: string;
  entryDate: string;
  amount: number;
  expenseCoa: string;
  accumCoa: string;
  transactionId: string;
  docNo: string;
  notes?: string;
};

export function buildAssetDepreciationJournalLines(
  input: AssetDepreciationPostInput
): JournalLineDraft[] {
  const amount = Number(input.amount) || 0;
  const ket = input.notes?.trim() || `Penyusutan — ${input.assetName}`;

  return [
    {
      lineDate: input.entryDate,
      accountName: input.expenseCoa,
      debit: amount,
      credit: 0,
      keterangan: ket
    },
    {
      lineDate: input.entryDate,
      accountName: input.accumCoa,
      debit: 0,
      credit: amount,
      keterangan: ket
    }
  ];
}

export async function postAssetDepreciation(
  supabase: SupabaseClient,
  input: AssetDepreciationPostInput
): Promise<{ entryId: string; skipped: boolean }> {
  const amount = Number(input.amount) || 0;
  if (amount <= 0) {
    throw new Error("Jumlah penyusutan harus lebih dari 0");
  }

  const lines = buildAssetDepreciationJournalLines(input);
  const result = await postJournalEntry(
    supabase,
    {
      organizationId: input.organizationId,
      modul: "ASSET_DEPRECIATION",
      transactionId: input.transactionId,
      docNo: input.docNo,
      entryDate: input.entryDate,
      sourceDocType: "FIXED_ASSET",
      sourceDocId: input.fixedAssetId,
      metadata: {
        fixedAssetId: input.fixedAssetId,
        assetName: input.assetName,
        amount,
        expenseCoa: input.expenseCoa,
        accumCoa: input.accumCoa,
        notes: input.notes || null
      }
    },
    lines
  );

  return { entryId: result.entryId, skipped: result.skipped };
}

export function assetDepreciationTransactionId(assetId: string, periodDate: string): string {
  return `DEPR-${assetId.slice(0, 8)}-${periodDate}`;
}

export function assetDepreciationDocNo(assetCode: string | null, periodDate: string): string {
  const code = (assetCode || "AST").replace(/\s+/g, "");
  return `DEP/${code}/${periodDate.replace(/-/g, "")}`;
}
