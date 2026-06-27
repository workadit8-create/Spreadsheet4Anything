"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { DetailModalTabs, TransactionJournalView } from "@/components/jurnal/TransactionJournalView";

type ListItem = {
  id: string;
  docNo: string;
  docDate: string;
  supplierName: string;
  outletCode?: string | null;
  totalQty?: number;
  lineCount?: number;
  total?: number;
};

type DetailKind = "receipt" | "settlement" | "return";

type DetailData = {
  kind: DetailKind;
  header: {
    id: string;
    docNo: string;
    docDate: string;
    status: string;
    supplierName: string;
    outletCode?: string | null;
    notes?: string | null;
    total?: number;
    rekening?: string | null;
  };
  lines: Array<Record<string, string | number>>;
  hasJournal: boolean;
  journalSourceType?: string;
  journalSourceId?: string;
  journalHint?: string;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function detailUrl(kind: DetailKind, id: string) {
  if (kind === "receipt") return `/api/inventory/consignment/receipts/${id}`;
  if (kind === "settlement") return `/api/inventory/consignment/settlements/${id}`;
  return `/api/inventory/consignment/returns/${id}`;
}

function DocList({
  items,
  kind,
  emptyLabel,
  onDetail
}: {
  items: ListItem[];
  kind: DetailKind;
  emptyLabel: string;
  onDetail: (kind: DetailKind, id: string) => void;
}) {
  if (!items.length) return <p className="text-sm text-slate-500">{emptyLabel}</p>;

  return (
    <ul className="space-y-2 text-sm">
      {items.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-2 rounded border border-slate-100 p-2">
          <div>
            <div className="font-medium">{r.docNo}</div>
            <div className="text-slate-600">
              {r.docDate} · {r.supplierName}
              {r.outletCode ? ` · ${r.outletCode}` : ""}
            </div>
            <div className="text-xs text-slate-500">
              {r.total != null
                ? formatRp(r.total)
                : `${r.lineCount ?? 0} produk · qty ${r.totalQty ?? 0}`}
            </div>
          </div>
          <Button type="button" variant="ghost" onClick={() => onDetail(kind, r.id)}>
            Detail
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function ConsignmentHistoryClient() {
  const [receipts, setReceipts] = useState<ListItem[]>([]);
  const [settlements, setSettlements] = useState<ListItem[]>([]);
  const [returns, setReturns] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"detail" | "jurnal">("detail");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DetailData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, setRes, retRes] = await Promise.all([
        fetch("/api/inventory/consignment/receipts"),
        fetch("/api/inventory/consignment/settlements"),
        fetch("/api/inventory/consignment/returns")
      ]);
      const recData = await recRes.json();
      const setData = await setRes.json();
      const retData = await retRes.json();
      if (!recRes.ok) throw new Error(recData.error || "Gagal memuat penerimaan");
      if (!setRes.ok) throw new Error(setData.error || "Gagal memuat settlement");
      if (!retRes.ok) throw new Error(retData.error || "Gagal memuat retur");

      setReceipts(
        (recData.items || []).map((r: Record<string, unknown>) => ({
          id: String(r.id),
          docNo: String(r.receiptNo),
          docDate: String(r.receiptDate),
          supplierName: String(r.supplierName),
          outletCode: r.outletCode as string | null,
          totalQty: Number(r.totalQty) || 0,
          lineCount: Number(r.lineCount) || 0
        }))
      );
      setSettlements(
        (setData.settlements || []).map((s: Record<string, unknown>) => ({
          id: String(s.id),
          docNo: String(s.settlementNo),
          docDate: String(s.settlementDate),
          supplierName: String(s.supplierName),
          total: Number(s.total) || 0
        }))
      );
      setReturns(
        (retData.items || []).map((r: Record<string, unknown>) => ({
          id: String(r.id),
          docNo: String(r.returnNo),
          docDate: String(r.returnDate),
          supplierName: String(r.supplierName),
          outletCode: r.outletCode as string | null,
          totalQty: Number(r.totalQty) || 0,
          lineCount: Number(r.lineCount) || 0
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(kind: DetailKind, id: string) {
    setDetailOpen(true);
    setDetailTab("detail");
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(detailUrl(kind, id));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat detail");
      setDetail(data as DetailData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat detail");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetail(null);
  }

  const kindLabel =
    detail?.kind === "receipt"
      ? "Penerimaan titip"
      : detail?.kind === "settlement"
        ? "Pelunasan titip"
        : "Retur barang titip";

  return (
    <div>
      <PageHeader
        title="Riwayat Titip Jual"
        description="Penerimaan barang titip, pelunasan ke supplier, dan retur barang"
      />
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Memuat…</p> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Penerimaan titip</h2>
          <DocList
            items={receipts}
            kind="receipt"
            emptyLabel="Belum ada penerimaan."
            onDetail={openDetail}
          />
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Pelunasan titip</h2>
          <DocList
            items={settlements}
            kind="settlement"
            emptyLabel="Belum ada settlement."
            onDetail={openDetail}
          />
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Retur barang</h2>
          <DocList
            items={returns}
            kind="return"
            emptyLabel="Belum ada retur."
            onDetail={openDetail}
          />
        </Card>
      </div>

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={closeDetail}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading || !detail ? (
              <p className="py-10 text-center text-sm text-slate-500">Memuat detail…</p>
            ) : (
              <>
                <DetailModalTabs
                  tab={detailTab}
                  onTabChange={setDetailTab}
                  showJournal={detail.hasJournal}
                />

                {detailTab === "detail" ? (
                  <>
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {kindLabel}:{" "}
                          <span className="text-brand-600">{detail.header.docNo}</span>
                        </h3>
                        <p className="text-sm text-slate-500">
                          {detail.header.docDate} · {detail.header.supplierName}
                          {detail.header.outletCode ? ` · ${detail.header.outletCode}` : ""}
                        </p>
                        {detail.header.total != null ? (
                          <p className="text-sm font-medium text-slate-700">
                            Total: {formatRp(detail.header.total)}
                          </p>
                        ) : null}
                        {detail.header.rekening ? (
                          <p className="text-xs text-slate-500">Rekening: {detail.header.rekening}</p>
                        ) : null}
                        {detail.header.notes ? (
                          <p className="text-xs text-slate-500">Catatan: {detail.header.notes}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-600"
                        onClick={closeDetail}
                      >
                        ✕
                      </button>
                    </div>

                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-800 text-left text-white">
                          {detail.kind === "settlement" ? (
                            <>
                              <th className="px-3 py-2">Invoice</th>
                              <th className="px-3 py-2">Produk</th>
                              <th className="px-3 py-2 text-center">Qty</th>
                              <th className="px-3 py-2 text-right">Harga titip</th>
                              <th className="px-3 py-2 text-right">Total</th>
                            </>
                          ) : (
                            <>
                              <th className="px-3 py-2">Produk</th>
                              <th className="px-3 py-2 text-center">Qty</th>
                              {detail.kind === "receipt" ? (
                                <th className="px-3 py-2 text-right">Harga titip</th>
                              ) : null}
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            {detail.kind === "settlement" ? (
                              <>
                                <td className="px-3 py-2">{String(line.orderNo || "—")}</td>
                                <td className="px-3 py-2">{String(line.productName || "—")}</td>
                                <td className="px-3 py-2 text-center">{line.qty}</td>
                                <td className="px-3 py-2 text-right">
                                  {formatRp(Number(line.unitSettlement) || 0)}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold">
                                  {formatRp(Number(line.totalAmount) || 0)}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2">
                                  {String(line.sku ? `${line.sku} — ` : "")}
                                  {String(line.productName || "—")}
                                </td>
                                <td className="px-3 py-2 text-center">{line.qty}</td>
                                {detail.kind === "receipt" ? (
                                  <td className="px-3 py-2 text-right">
                                    {formatRp(Number(line.unitSettlement) || 0)}
                                  </td>
                                ) : null}
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                      <Button type="button" variant="ghost" onClick={closeDetail}>
                        Tutup
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          Jurnal: <span className="text-brand-600">{detail.header.docNo}</span>
                        </h3>
                        <p className="text-sm text-slate-500">{detail.header.docDate}</p>
                      </div>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-600"
                        onClick={closeDetail}
                      >
                        ✕
                      </button>
                    </div>
                    {detail.hasJournal && detail.journalSourceType && detail.journalSourceId ? (
                      <TransactionJournalView
                        sourceType={detail.journalSourceType}
                        sourceId={detail.journalSourceId}
                        active={detailTab === "jurnal"}
                      />
                    ) : (
                      <p className="py-6 text-center text-sm text-slate-500">
                        {detail.journalHint || "Dokumen ini tidak membuat jurnal akuntansi."}
                      </p>
                    )}
                    <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                      <Button type="button" variant="ghost" onClick={closeDetail}>
                        Tutup
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
