import type { SupabaseClient } from "@supabase/supabase-js";
import { wibTodayIso } from "@/lib/date/wib";
import { buildReversalJournalLines, voidTransactionId } from "./journal-reversal";
import { postJournalEntry } from "./journal-supabase";
import type { JournalLineDraft } from "./journal-rules";
import { voidLinkedMutasiBySource, deleteLinkedMutasiBySource } from "./linked-mutasi";
import { reversePurchaseStockForOrderIfEnabled } from "@/lib/inventory/purchase-inventory-post";
import type { PurchaseLineRow, PurchaseOrderRow } from "./types";

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

export async function voidPurchaseOrder(
  supabase: SupabaseClient,
  orderId: string,
  userId: string,
  reason?: string
): Promise<{ reversedEntries: number }> {
  const { data: order, error: orderErr } = await supabase
    .from("purchase_orders")
    .select("id, organization_id, po_no, status, order_date, warehouse_id, outlet_code, metadata")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    throw new Error(orderErr?.message || "PO tidak ditemukan");
  }

  if (order.status === "VOIDED") {
    throw new Error("PO sudah dibatalkan");
  }
  if (order.status !== "POSTED") {
    throw new Error("Hanya PO POSTED yang bisa dibatalkan (void)");
  }

  const { count: paymentCount, error: payCountErr } = await supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("doc_type", "UTANG_PAYMENT")
    .eq("doc_id", order.id)
    .in("status", ["CONFIRMED", "POSTED"]);

  if (payCountErr) {
    throw new Error(payCountErr.message);
  }
  if ((paymentCount ?? 0) > 0) {
    throw new Error(
      "PO sudah memiliki pelunasan hutang — tidak bisa dibatalkan. Void pelunasan terlebih dahulu jika perlu."
    );
  }

  const { data: entries, error: entriesErr } = await supabase
    .from("journal_entries")
    .select(
      "id, modul, transaction_id, doc_no, entry_date, journal_lines(line_date, account_name, debit, credit, keterangan, sort_order)"
    )
    .eq("organization_id", order.organization_id)
    .eq("source_doc_type", "PURCHASE_ORDER")
    .eq("source_doc_id", order.id)
    .eq("entry_kind", "NORMAL");

  if (entriesErr) {
    throw new Error(entriesErr.message);
  }

  const { data: poLines, error: poLinesErr } = await supabase
    .from("purchase_lines")
    .select("*")
    .eq("purchase_order_id", order.id)
    .order("sort_order");

  if (poLinesErr) {
    throw new Error(poLinesErr.message);
  }

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

    const reversalLines = buildReversalJournalLines(drafts, voidDate, order.po_no);
    const reversalTxId = voidTransactionId(raw.transaction_id);

    const result = await postJournalEntry(supabase, {
      organizationId: order.organization_id,
      modul: raw.modul as "PEMBELIAN",
      transactionId: reversalTxId,
      docNo: order.po_no,
      entryDate: voidDate,
      sourceDocType: "PURCHASE_ORDER_VOID",
      sourceDocId: order.id,
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

  await reversePurchaseStockForOrderIfEnabled(supabase, {
    organizationId: order.organization_id,
    order: order as PurchaseOrderRow & {
      warehouse_id?: string | null;
      outlet_code?: string | null;
    },
    lines: (poLines || []) as PurchaseLineRow[],
    createdBy: userId
  });

  const { error: updErr } = await supabase
    .from("purchase_orders")
    .update({
      status: "VOIDED",
      voided_at: new Date().toISOString(),
      void_reason: reason?.trim() || null,
      voided_by: userId,
      updated_at: new Date().toISOString()
    })
    .eq("id", order.id);

  if (updErr) {
    throw new Error(updErr.message);
  }

  await voidLinkedMutasiBySource(
    supabase,
    order.organization_id,
    "PURCHASE_ORDER",
    order.id,
    userId,
    reason
  );

  return { reversedEntries };
}

export async function deleteConfirmedPurchaseOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: order, error: orderErr } = await supabase
    .from("purchase_orders")
    .select("id, status, organization_id")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    throw new Error(orderErr?.message || "PO tidak ditemukan");
  }

  if (order.status !== "CONFIRMED") {
    throw new Error("Hanya PO CONFIRMED (belum posting) yang bisa dihapus");
  }

  const { count: paymentCount } = await supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("doc_type", "UTANG_PAYMENT")
    .eq("doc_id", order.id)
    .in("status", ["CONFIRMED", "POSTED"]);

  if ((paymentCount ?? 0) > 0) {
    throw new Error("PO memiliki data pelunasan — tidak bisa dihapus");
  }

  await supabase.from("posting_jobs").delete().eq("doc_type", "PURCHASE_ORDER").eq("doc_id", order.id);

  await deleteLinkedMutasiBySource(supabase, order.organization_id, "PURCHASE_ORDER", order.id);

  const { error: delErr } = await supabase.from("purchase_orders").delete().eq("id", order.id);
  if (delErr) {
    throw new Error(delErr.message);
  }
}
