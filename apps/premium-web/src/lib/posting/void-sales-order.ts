import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReversalJournalLines, voidTransactionId } from "./journal-reversal";
import { postJournalEntry } from "./journal-supabase";
import type { JournalLineDraft } from "./journal-rules";

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

export async function voidSalesOrder(
  supabase: SupabaseClient,
  orderId: string,
  userId: string,
  reason?: string
): Promise<{ reversedEntries: number }> {
  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .select("id, organization_id, order_no, status, order_date")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    throw new Error(orderErr?.message || "Invoice tidak ditemukan");
  }

  if (order.status === "VOIDED") {
    throw new Error("Invoice sudah dibatalkan");
  }
  if (order.status !== "POSTED") {
    throw new Error("Hanya invoice POSTED yang bisa dibatalkan (void)");
  }

  const { count: paymentCount, error: payCountErr } = await supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("doc_type", "PIUTANG_PAYMENT")
    .eq("doc_id", order.id)
    .in("status", ["CONFIRMED", "POSTED"]);

  if (payCountErr) {
    throw new Error(payCountErr.message);
  }
  if ((paymentCount ?? 0) > 0) {
    throw new Error(
      "Invoice sudah memiliki pelunasan — tidak bisa dibatalkan. Void pelunasan terlebih dahulu jika perlu."
    );
  }

  const { data: entries, error: entriesErr } = await supabase
    .from("journal_entries")
    .select(
      "id, modul, transaction_id, doc_no, entry_date, journal_lines(line_date, account_name, debit, credit, keterangan, sort_order)"
    )
    .eq("organization_id", order.organization_id)
    .eq("source_doc_type", "SALES_ORDER")
    .eq("source_doc_id", order.id)
    .eq("entry_kind", "NORMAL");

  if (entriesErr) {
    throw new Error(entriesErr.message);
  }

  const voidDate = new Date().toISOString().slice(0, 10);
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

    const reversalLines = buildReversalJournalLines(drafts, voidDate, order.order_no);
    const reversalTxId = voidTransactionId(raw.transaction_id);

    const result = await postJournalEntry(supabase, {
      organizationId: order.organization_id,
      modul: raw.modul as "PEMASUKAN",
      transactionId: reversalTxId,
      docNo: order.order_no,
      entryDate: voidDate,
      sourceDocType: "SALES_ORDER_VOID",
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

  const { error: updErr } = await supabase
    .from("sales_orders")
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

  return { reversedEntries };
}

export async function deleteConfirmedSalesOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    throw new Error(orderErr?.message || "Invoice tidak ditemukan");
  }

  if (order.status !== "CONFIRMED") {
    throw new Error("Hanya invoice CONFIRMED (belum posting) yang bisa dihapus");
  }

  const { count: paymentCount } = await supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("doc_type", "PIUTANG_PAYMENT")
    .eq("doc_id", order.id)
    .in("status", ["CONFIRMED", "POSTED"]);

  if ((paymentCount ?? 0) > 0) {
    throw new Error("Invoice memiliki data pelunasan — tidak bisa dihapus");
  }

  await supabase.from("posting_jobs").delete().eq("doc_type", "SALES_ORDER").eq("doc_id", order.id);

  const { error: delErr } = await supabase.from("sales_orders").delete().eq("id", order.id);
  if (delErr) {
    throw new Error(delErr.message);
  }
}
