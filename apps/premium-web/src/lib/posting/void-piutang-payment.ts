import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReversalJournalLines, voidTransactionId } from "./journal-reversal";
import { postJournalEntry } from "./journal-supabase";
import type { JournalLineDraft } from "./journal-rules";
import { recomputeOrderPaymentMeta } from "./piutang";
import type { SalesLineRow } from "./types";

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

type LineRollback = {
  lineId: string;
  metadata: Record<string, unknown>;
};

export async function voidPiutangPayment(
  supabase: SupabaseClient,
  paymentId: string,
  userId: string,
  reason?: string
): Promise<{ reversedEntries: number }> {
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .eq("doc_type", "PIUTANG_PAYMENT")
    .single();

  if (payErr || !payment) {
    throw new Error(payErr?.message || "Pelunasan tidak ditemukan");
  }

  const status = String(payment.status || "CONFIRMED");
  if (status === "VOIDED") {
    throw new Error("Pelunasan sudah dibatalkan");
  }
  if (status !== "POSTED") {
    throw new Error("Hanya pelunasan POSTED yang bisa dibatalkan (void)");
  }

  const meta = (payment.metadata || {}) as Record<string, unknown>;
  const lineRollbacks = (meta.lineRollbacks || []) as LineRollback[];
  const orderMetaBefore = meta.orderMetaBefore as Record<string, unknown> | undefined;
  const salesOrderId = String(meta.salesOrderId || payment.doc_id || "");

  if (!lineRollbacks.length) {
    throw new Error("Metadata rollback baris tidak ada — tidak bisa void otomatis");
  }

  const { data: entries, error: entriesErr } = await supabase
    .from("journal_entries")
    .select(
      "id, modul, transaction_id, doc_no, entry_date, journal_lines(line_date, account_name, debit, credit, keterangan, sort_order)"
    )
    .eq("organization_id", payment.organization_id)
    .eq("source_doc_type", "PIUTANG_PAYMENT")
    .eq("source_doc_id", payment.id)
    .eq("entry_kind", "NORMAL");

  if (entriesErr) {
    throw new Error(entriesErr.message);
  }

  const voidDate = new Date().toISOString().slice(0, 10);
  const invoiceNo = String(meta.invoiceNo || "");
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

    const reversalLines = buildReversalJournalLines(drafts, voidDate, invoiceNo);
    const reversalTxId = voidTransactionId(raw.transaction_id);

    const result = await postJournalEntry(
      supabase,
      {
        organizationId: payment.organization_id,
        modul: "PELUNASAN_PIUTANG",
        transactionId: reversalTxId,
        docNo: invoiceNo,
        entryDate: voidDate,
        sourceDocType: "PIUTANG_PAYMENT_VOID",
        sourceDocId: payment.id,
        metadata: {
          reversesEntryId: raw.id,
          reversesTransactionId: raw.transaction_id,
          voidReason: reason || null
        }
      },
      reversalLines
    );

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

  for (const rollback of lineRollbacks) {
    const { error: lineErr } = await supabase
      .from("sales_lines")
      .update({ metadata: rollback.metadata })
      .eq("id", rollback.lineId);
    if (lineErr) {
      throw new Error("Gagal restore baris invoice: " + lineErr.message);
    }
  }

  if (salesOrderId) {
    const { data: order } = await supabase
      .from("sales_orders")
      .select("id, metadata")
      .eq("id", salesOrderId)
      .single();

    const { data: orderLines } = await supabase
      .from("sales_lines")
      .select("*")
      .eq("sales_order_id", salesOrderId)
      .order("sort_order");

    const baseMeta =
      orderMetaBefore && Object.keys(orderMetaBefore).length
        ? orderMetaBefore
        : ((order?.metadata || {}) as Record<string, unknown>);

    const mergedMeta = recomputeOrderPaymentMeta(
      baseMeta,
      (orderLines || []) as SalesLineRow[]
    );

    await supabase
      .from("sales_orders")
      .update({
        metadata: mergedMeta,
        updated_at: new Date().toISOString()
      })
      .eq("id", salesOrderId);
  }

  const { error: updErr } = await supabase
    .from("payments")
    .update({
      status: "VOIDED",
      voided_at: new Date().toISOString(),
      void_reason: reason?.trim() || null,
      voided_by: userId
    })
    .eq("id", payment.id);

  if (updErr) {
    throw new Error(updErr.message);
  }

  return { reversedEntries };
}

export async function deleteConfirmedPiutangPayment(
  supabase: SupabaseClient,
  paymentId: string
): Promise<void> {
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("id, status, metadata, doc_id")
    .eq("id", paymentId)
    .eq("doc_type", "PIUTANG_PAYMENT")
    .single();

  if (payErr || !payment) {
    throw new Error(payErr?.message || "Pelunasan tidak ditemukan");
  }

  if (payment.status !== "CONFIRMED") {
    throw new Error("Hanya pelunasan CONFIRMED (belum posting) yang bisa dihapus");
  }

  const meta = (payment.metadata || {}) as Record<string, unknown>;
  const lineRollbacks = (meta.lineRollbacks || []) as LineRollback[];
  const orderMetaBefore = meta.orderMetaBefore as Record<string, unknown> | undefined;
  const salesOrderId = String(meta.salesOrderId || payment.doc_id || "");

  for (const rollback of lineRollbacks) {
    await supabase
      .from("sales_lines")
      .update({ metadata: rollback.metadata })
      .eq("id", rollback.lineId);
  }

  if (salesOrderId && orderMetaBefore) {
    const { data: orderLines } = await supabase
      .from("sales_lines")
      .select("*")
      .eq("sales_order_id", salesOrderId);

    const mergedMeta = recomputeOrderPaymentMeta(
      orderMetaBefore,
      (orderLines || []) as SalesLineRow[]
    );

    await supabase
      .from("sales_orders")
      .update({
        metadata: mergedMeta,
        updated_at: new Date().toISOString()
      })
      .eq("id", salesOrderId);
  }

  await supabase
    .from("posting_jobs")
    .delete()
    .eq("doc_type", "PIUTANG_PAYMENT")
    .eq("doc_id", payment.id);

  const { error: delErr } = await supabase.from("payments").delete().eq("id", payment.id);
  if (delErr) {
    throw new Error(delErr.message);
  }
}
