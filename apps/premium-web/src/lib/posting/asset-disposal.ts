import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalLineDraft } from "./journal-rules";
import { postJournalEntry } from "./journal-supabase";
import {
  computeDisposalAmounts,
  DEFAULT_GAIN_ON_DISPOSAL_COA,
  DEFAULT_LOSS_ON_DISPOSAL_COA
} from "@/lib/assets/disposal";
import {
  insertLinkedMasukMutasi,
  linkedMutasiTransactionId,
  type KasBankAccountRef
} from "./linked-mutasi";

export type AssetDisposalPostInput = {
  organizationId: string;
  fixedAssetId: string;
  assetName: string;
  assetCode: string | null;
  entryDate: string;
  acquisitionCost: number;
  totalDepreciated: number;
  salvageValue: number;
  proceeds: number;
  proceedsCoa?: string;
  proceedsAccount?: KasBankAccountRef | null;
  assetCoa: string;
  accumCoa: string;
  gainCoa?: string;
  lossCoa?: string;
  transactionId: string;
  docNo: string;
  notes?: string;
};

export function buildAssetDisposalJournalLines(
  input: AssetDisposalPostInput
): JournalLineDraft[] {
  const amounts = computeDisposalAmounts(
    input.acquisitionCost,
    input.totalDepreciated,
    input.proceeds,
    input.salvageValue
  );
  const ket = input.notes?.trim() || `Disposal — ${input.assetName}`;
  const gainCoa = input.gainCoa || DEFAULT_GAIN_ON_DISPOSAL_COA;
  const lossCoa = input.lossCoa || DEFAULT_LOSS_ON_DISPOSAL_COA;
  const lines: JournalLineDraft[] = [];

  if (amounts.totalDepreciated > 0) {
    lines.push({
      lineDate: input.entryDate,
      accountName: input.accumCoa,
      debit: amounts.totalDepreciated,
      credit: 0,
      keterangan: ket
    });
  }

  if (amounts.proceeds > 0 && input.proceedsCoa) {
    lines.push({
      lineDate: input.entryDate,
      accountName: input.proceedsCoa,
      debit: amounts.proceeds,
      credit: 0,
      keterangan: ket
    });
  }

  lines.push({
    lineDate: input.entryDate,
    accountName: input.assetCoa,
    debit: 0,
    credit: amounts.acquisitionCost,
    keterangan: ket
  });

  if (amounts.gainLoss > 0) {
    lines.push({
      lineDate: input.entryDate,
      accountName: gainCoa,
      debit: 0,
      credit: amounts.gainLoss,
      keterangan: `${ket} — laba penjualan`
    });
  } else if (amounts.gainLoss < 0) {
    lines.push({
      lineDate: input.entryDate,
      accountName: lossCoa,
      debit: -amounts.gainLoss,
      credit: 0,
      keterangan: `${ket} — rugi penjualan`
    });
  }

  return lines;
}

export async function postAssetDisposal(
  supabase: SupabaseClient,
  input: AssetDisposalPostInput
): Promise<{ entryId: string; skipped: boolean; amounts: ReturnType<typeof computeDisposalAmounts> }> {
  const amounts = computeDisposalAmounts(
    input.acquisitionCost,
    input.totalDepreciated,
    input.proceeds,
    input.salvageValue
  );

  if (amounts.proceeds > 0 && !input.proceedsCoa) {
    throw new Error("Rekening penerimaan wajib dipilih jika ada hasil penjualan");
  }

  const lines = buildAssetDisposalJournalLines(input);
  const result = await postJournalEntry(
    supabase,
    {
      organizationId: input.organizationId,
      modul: "ASSET_DISPOSAL",
      transactionId: input.transactionId,
      docNo: input.docNo,
      entryDate: input.entryDate,
      sourceDocType: "FIXED_ASSET",
      sourceDocId: input.fixedAssetId,
      metadata: {
        fixedAssetId: input.fixedAssetId,
        assetName: input.assetName,
        ...amounts,
        assetCoa: input.assetCoa,
        accumCoa: input.accumCoa,
        proceedsCoa: input.proceedsCoa || null,
        notes: input.notes || null
      }
    },
    lines
  );

  if (amounts.proceeds > 0 && input.proceedsAccount && !result.skipped) {
    await insertLinkedMasukMutasi(supabase, {
      organizationId: input.organizationId,
      transferDate: input.entryDate,
      account: input.proceedsAccount,
      counterpartyLabel: input.assetCoa,
      amount: amounts.proceeds,
      keterangan: input.notes?.trim() || `Penjualan aset — ${input.assetName}`,
      transactionId: linkedMutasiTransactionId("AD", input.transactionId),
      sourceType: "ASSET_DISPOSAL",
      sourceId: input.fixedAssetId,
      journalHandledBy: "ASSET_DISPOSAL"
    });
  }

  return { entryId: result.entryId, skipped: result.skipped, amounts };
}

export function assetDisposalTransactionId(assetId: string): string {
  return `DISP-${assetId.slice(0, 8)}`;
}

export function assetDisposalDocNo(assetCode: string | null, disposalDate: string): string {
  const code = (assetCode || "AST").replace(/\s+/g, "");
  return `DISP/${code}/${disposalDate.replace(/-/g, "")}`;
}
