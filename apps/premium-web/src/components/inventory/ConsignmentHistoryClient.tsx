"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { DetailModalTabs, TransactionJournalView } from "@/components/jurnal/TransactionJournalView";
import { ConsignmentFormCard, ConsignmentPageShell } from "@/components/inventory/consignment-layout";
import { wibMonthStartIso, wibTodayIso } from "@/lib/date/wib";
import { canPostJournal, type MembershipRole } from "@/lib/org/roles";
import { PostingRoleBanner } from "@/components/layout/PostingRoleBanner";

type ListItem = {
  id: string;
  docNo: string;
  docDate: string;
  supplierName: string;
  outletCode?: string | null;
  totalQty?: number;
  lineCount?: number;
  total?: number;
  status?: string;
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

type Supplier = { id: string; name: string };

function defaultDateRange() {
  return {
    start: wibMonthStartIso(),
    end: wibTodayIso()
  };
}

function buildFilterParams(start: string, end: string, supplierId: string) {
  const params = new URLSearchParams({ start, end });
  if (supplierId) params.set("supplier_id", supplierId);
  return params;
}
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
  onDetail,
  onVoid,
  canPost,
  actingId
}: {
  items: ListItem[];
  kind: DetailKind;
  emptyLabel: string;
  onDetail: (kind: DetailKind, id: string) => void;
  onVoid?: (id: string, docNo: string) => void;
  canPost?: boolean;
  actingId?: string | null;
}) {
  if (!items.length) return <p className="text-sm text-slate-500">{emptyLabel}</p>;

  const showVoid = kind === "return" && canPost && onVoid;

  return (
    <ul className="space-y-3 text-sm">
      {items.map((r) => (
        <li
          key={r.id}
          className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
        >
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
              {r.status === "VOIDED" ? " · Dibatalkan" : ""}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button type="button" variant="ghost" onClick={() => onDetail(kind, r.id)}>
              Detail
            </Button>
            {showVoid && r.status === "POSTED" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={actingId === r.id}
                onClick={() => onVoid(r.id, r.docNo)}
              >
                {actingId === r.id ? "..." : "Batal"}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ConsignmentHistoryClient({ role }: { role: MembershipRole }) {
  const canPost = canPostJournal(role);
  const defaults = useMemo(() => defaultDateRange(), []);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receipts, setReceipts] = useState<ListItem[]>([]);
  const [settlements, setSettlements] = useState<ListItem[]>([]);
  const [returns, setReturns] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"detail" | "jurnal">("detail");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/master/suppliers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuppliers(
        (data.items || data.suppliers || []).map((s: Supplier) => ({ id: s.id, name: s.name }))
      );
    } catch {
      setSuppliers([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildFilterParams(start, end, supplierId).toString();
      const [recRes, setRes, retRes] = await Promise.all([
        fetch(`/api/inventory/consignment/receipts?${qs}`),
        fetch(`/api/inventory/consignment/settlements?${qs}`),
        fetch(`/api/inventory/consignment/returns?${qs}`)
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
          lineCount: Number(r.lineCount) || 0,
          status: String(r.status || "POSTED")
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [start, end, supplierId]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

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

  async function voidReturn(id: string, returnNo: string) {
    const reason = window.prompt(`Alasan batal retur ${returnNo}?`, "Input salah");
    if (reason === null) return;

    setActingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/inventory/consignment/returns/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Retur dibatalkan");
      closeDetail();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal void");
    } finally {
      setActingId(null);
    }
  }

  const kindLabel =
    detail?.kind === "receipt"
      ? "Penerimaan titip"
      : detail?.kind === "settlement"
        ? "Pelunasan titip"
        : "Retur barang titip";

  return (
    <ConsignmentPageShell wide>
      <PageHeader
        title="Riwayat Titip Jual"
        description="Penerimaan barang titip, pelunasan ke supplier, dan retur barang"
      />
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mb-6 text-sm text-slate-600">{message}</p> : null}
      <PostingRoleBanner canPost={canPost} />

      <ConsignmentFormCard>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-5">
          <div>
            <Label>Dari tanggal</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>Sampai tanggal</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="min-w-[200px]">
            <Label>Supplier</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Semua supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Memuat…" : "Cari data"}
          </Button>
        </div>
      </ConsignmentFormCard>

      {loading ? <p className="my-6 text-sm text-slate-500">Memuat…</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <ConsignmentFormCard>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Penerimaan titip</h2>
          <DocList
            items={receipts}
            kind="receipt"
            emptyLabel="Belum ada penerimaan."
            onDetail={openDetail}
          />
        </ConsignmentFormCard>

        <ConsignmentFormCard>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Pelunasan titip</h2>
          <DocList
            items={settlements}
            kind="settlement"
            emptyLabel="Belum ada settlement."
            onDetail={openDetail}
          />
        </ConsignmentFormCard>

        <ConsignmentFormCard>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Retur barang</h2>
          <DocList
            items={returns}
            kind="return"
            emptyLabel="Belum ada retur."
            onDetail={openDetail}
            onVoid={voidReturn}
            canPost={canPost}
            actingId={actingId}
          />
        </ConsignmentFormCard>
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
                        {detail.kind === "return" && detail.header.status === "VOIDED" ? (
                          <p className="text-sm text-amber-700">Status: dibatalkan</p>
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

                    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                      {detail.kind === "return" &&
                      detail.header.status === "POSTED" &&
                      canPost ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={actingId !== null}
                          onClick={() => voidReturn(detail.header.id, detail.header.docNo)}
                        >
                          Batal retur
                        </Button>
                      ) : null}
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
    </ConsignmentPageShell>
  );
}
