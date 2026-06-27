import type { SupabaseClient } from "@supabase/supabase-js";
import { wibTodayIso } from "@/lib/date/wib";
import {
  hasPurchaseReturnVoidMovement,
  purchaseStockLinesFromProducts,
  restorePurchaseStockAfterReturnVoid
} from "@/lib/inventory/purchase-return";
import { updateProductHppFromPurchaseLines } from "@/lib/inventory/purchase-inventory";
import { buildReversalJournalLines, voidTransactionId } from "./journal-reversal";
import { postJournalEntry } from "./journal-supabase";
import type { JournalLineDraft } from "./journal-rules";
import { voidLinkedMutasiBySource } from "./linked-mutasi";

type JournalLineRow = {
  line_date: string;
  account_name: string;
  debit: number;
  credit: number;
  keterangan: string | null;
  sort_order: number;
};

type JournalEntryRow = {
  id: string;
  modul: string;
  transaction_id: string;
  doc_no: string;
  entry_date: string;
  journal_lines: JournalLineRow[];
};

export async function voidPurchaseReturn(
  supabase: SupabaseClient,
  returnId: string,
  userId: string,
  reason?: string
): Promise<{ reversedEntries: number }> {
  const { data: header, error: headerErr } = await supabase
    .from("purchase_returns")
    .select("id, organization_id, return_no, status, warehouse_id, refund_mode, metadata")
    .eq("id", returnId)
    .single();

  if (headerErr || !header) {
    throw new Error(headerErr?.message || "Retur tidak ditemukan");
  }

  if (header.status === "VOIDED") {
    throw new Error("Retur sudah dibatalkan");
  }
  if (header.status !== "POSTED") {
    throw new Error("Hanya retur POSTED yang bisa dibatalkan");
  }

  const alreadyVoid = await hasPurchaseReturnVoidMovement(
    supabase,
    header.organization_id,
    header.id
  );
  if (alreadyVoid) {
    throw new Error("Stok void retur sudah pernah diproses");
  }

  const { data: lineRows, error: lineErr } = await supabase
    .from("purchase_return_lines")
    .select("product_id, qty, unit_cost, dpp, tax_amount")
    .eq("return_id", returnId)
    .order("sort_order");

  if (lineErr) throw new Error(lineErr.message);
  if (!lineRows?.length) throw new Error("Retur tidak punya baris produk");

  const { data: entries, error: entriesErr } = await supabase
    .from("journal_entries")
    .select(
      "id, modul, transaction_id, doc_no, entry_date, journal_lines(line_date, account_name, debit, credit, keterangan, sort_order)"
    )
    .eq("organization_id", header.organization_id)
    .eq("source_doc_type", "PURCHASE_RETURN")
    .eq("source_doc_id", header.id)
    .eq("entry_kind", "NORMAL");

  if (entriesErr) throw new Error(entriesErr.message);

  const voidDate = wibTodayIso();
  let reversedEntries = 0;

  for (const raw of (entries || []) as JournalEntryRow[]) {
    const lines = ((raw.journal_lines || []) as JournalLineRow[]).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    if (!lines.length) continue;

    const drafts: JournalLineDraft[] = lines.map((l) => ({
      lineDate: l.line_date,
      accountName: l.account_name,
      debit: Number(l.debit),
      credit: Number(l.credit),
      keterangan: l.keterangan || ""
    }));

    const reversalLines = buildReversalJournalLines(drafts, voidDate, header.return_no);
    const reversalTxId = voidTransactionId(raw.transaction_id);

    const result = await postJournalEntry(supabase, {
      organizationId: header.organization_id,
      modul: raw.modul as "PEMBELIAN",
      transactionId: reversalTxId,
      docNo: header.return_no,
      entryDate: voidDate,
      sourceDocType: "PURCHASE_RETURN_VOID",
      sourceDocId: header.id,
      metadata: {
        reversesEntryId: raw.id,
        reversesTransactionId: raw.transaction_id,
        voidReason: reason || null
      }
    }, reversalLines);

    if (!result.skipped) {
      reversedEntries += 1;
      await supabase
        .from("journal_entries")
        .update({
          entry_kind: "VOID_REVERSAL",
          reverses_entry_id: raw.id
        })
        .eq("id", result.entryId);
    }
  }

  const hppLines = lineRows.map((l) => ({
    product_id: l.product_id,
    qty: Number(l.qty) || 0,
    unit_cost: Number(l.unit_cost) || 0,
    metadata: { dpp: Number(l.dpp) || 0, diskon: 0 }
  }));

  await updateProductHppFromPurchaseLines(supabase, header.organization_id, hppLines);

  const stockLines = await purchaseStockLinesFromProducts(
    supabase,
    header.organization_id,
    lineRows.map((l) => ({ product_id: String(l.product_id), qty: Number(l.qty) || 0 }))
  );

  await restorePurchaseStockAfterReturnVoid(supabase, {
    organizationId: header.organization_id,
    warehouseId: String(header.warehouse_id),
    returnId: header.id,
    returnNo: header.return_no,
    lines: stockLines,
    createdBy: userId,
    notes: reason ? `Void retur: ${reason}` : "Void retur pembelian"
  });

  if (header.refund_mode === "TUNAI") {
    await voidLinkedMutasiBySource(
      supabase,
      header.organization_id,
      "PURCHASE_RETURN",
      header.id,
      userId,
      reason
    );
  }

  const { error: updErr } = await supabase
    .from("purchase_returns")
    .update({
      status: "VOIDED",
      voided_at: new Date().toISOString(),
      void_reason: reason?.trim() || null,
      voided_by: userId
    })
    .eq("id", header.id);

  if (updErr) throw new Error(updErr.message);

  return { reversedEntries };
}
