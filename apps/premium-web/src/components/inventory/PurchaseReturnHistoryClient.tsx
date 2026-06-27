"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { DetailModalTabs, TransactionJournalView } from "@/components/jurnal/TransactionJournalView";
import { canPostJournal, type MembershipRole } from "@/lib/org/roles";
import { PostingRoleBanner } from "@/components/layout/PostingRoleBanner";
import { ConsignmentFormCard } from "@/components/inventory/consignment-layout";
import { wibMonthStartIso, wibTodayIso } from "@/lib/date/wib";

type ListItem = {
  id: string;
  returnNo: string;
  returnDate: string;
  supplierName: string;
  poNo: string | null;
  total: number;
  refundMode: string;
  status: string;
};

type DetailData = {
  header: {
    docNo: string;
    docDate: string;
    status: string;
    supplierName: string;
    poNo: string | null;
    total: number;
    dpp: number;
    taxAmount: number;
    refundMode: string;
    rekening: string | null;
    notes: string | null;
  };
  lines: Array<{
    productName: string;
    sku: string;
    qty: number;
    lineTotal: number;
  }>;
  hasJournal: boolean;
  journalSourceType: string;
  journalSourceId: string;
};

type Supplier = { id: string; name: string };

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function defaultDateRange() {
  return { start: wibMonthStartIso(), end: wibTodayIso() };
}

export function PurchaseReturnHistoryClient({ role }: { role: MembershipRole }) {
  const canPost = canPostJournal(role);
  const defaults = useMemo(() => defaultDateRange(), []);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
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
      setSuppliers((data.items || data.suppliers || []).map((s: Supplier) => ({ id: s.id, name: s.name })));
    } catch {
      setSuppliers([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      if (supplierId) params.set("supplier_id", supplierId);
      const res = await fetch(`/api/inventory/purchase-returns?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setItems(data.items || []);
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

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetailTab("detail");
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/inventory/purchase-returns/${id}`);
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

  async function voidReturn(id: string, returnNo: string) {
    const reason = window.prompt(`Alasan batal retur ${returnNo}?`, "Input salah");
    if (reason === null) return;

    setActingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/inventory/purchase-returns/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Retur dibatalkan");
      setDetailOpen(false);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal void");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-6">
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <ConsignmentFormCard>
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Riwayat retur</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat…</p>
        ) : !items.length ? (
          <p className="text-sm text-slate-500">Belum ada retur pembelian.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {items.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <div className="font-medium">{r.returnNo}</div>
                  <div className="text-slate-600">
                    {r.returnDate} · {r.supplierName}
                    {r.poNo ? ` · PO ${r.poNo}` : ""}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatRp(r.total)} · {r.refundMode === "TUNAI" ? "Refund tunai" : "Kurangi utang"}
                    {r.status === "VOIDED" ? " · Dibatalkan" : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Button type="button" variant="ghost" onClick={() => openDetail(r.id)}>
                    Detail
                  </Button>
                  {r.status === "POSTED" && canPost ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={actingId === r.id}
                      onClick={() => voidReturn(r.id, r.returnNo)}
                    >
                      {actingId === r.id ? "..." : "Batal"}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ConsignmentFormCard>

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setDetailOpen(false)}
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
                  showJournal={detail.header.status === "POSTED" || detail.header.status === "VOIDED"}
                />
                {detailTab === "detail" ? (
                  <>
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">
                        Retur: <span className="text-brand-600">{detail.header.docNo}</span>
                      </h3>
                      <p className="text-sm text-slate-500">
                        {detail.header.docDate} · {detail.header.supplierName}
                        {detail.header.poNo ? ` · PO ${detail.header.poNo}` : ""}
                      </p>
                      <p className="text-sm font-medium">{formatRp(detail.header.total)}</p>
                      {detail.header.status === "VOIDED" ? (
                        <p className="text-sm text-amber-700">Status: dibatalkan</p>
                      ) : null}
                    </div>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-800 text-left text-white">
                          <th className="px-3 py-2">Produk</th>
                          <th className="px-3 py-2 text-center">Qty</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="px-3 py-2">
                              {line.sku ? `${line.sku} — ` : ""}
                              {line.productName}
                            </td>
                            <td className="px-3 py-2 text-center">{line.qty}</td>
                            <td className="px-3 py-2 text-right">{formatRp(line.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      {detail.header.status === "POSTED" && canPost ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={actingId !== null}
                          onClick={() => voidReturn(detail.journalSourceId, detail.header.docNo)}
                        >
                          Batal retur
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" onClick={() => setDetailOpen(false)}>
                        Tutup
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-3">
                      <h3 className="text-lg font-semibold">
                        Jurnal: <span className="text-brand-600">{detail.header.docNo}</span>
                      </h3>
                    </div>
                    <TransactionJournalView
                      sourceType={detail.journalSourceType}
                      sourceId={detail.journalSourceId}
                      active={detailTab === "jurnal"}
                    />
                    <div className="mt-4 flex justify-end">
                      <Button type="button" variant="ghost" onClick={() => setDetailOpen(false)}>
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
