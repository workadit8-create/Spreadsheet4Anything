"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { ConsignmentFormCard } from "@/components/inventory/consignment-layout";
import { wibMonthStartIso, wibTodayIso } from "@/lib/date/wib";

type ListItem = {
  id: string;
  transferNo: string;
  transferDate: string;
  fromWarehouse: string;
  toWarehouse: string;
  outletCode: string | null;
  lineCount: number;
  totalQty: number;
  status: string;
};

type DetailData = {
  header: {
    docNo: string;
    docDate: string;
    status: string;
    outletCode: string | null;
    fromWarehouse: string;
    toWarehouse: string;
    notes: string | null;
  };
  lines: Array<{ productName: string; sku: string; qty: number }>;
};

function defaultDateRange() {
  return { start: wibMonthStartIso(), end: wibTodayIso() };
}

export function StockTransferHistoryClient() {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DetailData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/inventory/stock-transfers?${params}`);
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/inventory/stock-transfers/${id}`);
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(data.error || "Gagal memuat detail");
      setDetail(data as DetailData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat detail");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
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
          <Button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Memuat…" : "Cari"}
          </Button>
        </div>
      </ConsignmentFormCard>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <ConsignmentFormCard>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat…</p>
        ) : !items.length ? (
          <p className="text-sm text-slate-500">Belum ada transfer stok.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {items.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <div className="font-medium">{r.transferNo}</div>
                  <div className="text-slate-600">{r.transferDate}</div>
                  <div className="text-xs text-slate-500">
                    {r.fromWarehouse} → {r.toWarehouse}
                    {r.outletCode ? ` · ${r.outletCode}` : ""}
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.lineCount} produk · qty {r.totalQty}
                  </div>
                </div>
                <Button type="button" variant="ghost" onClick={() => openDetail(r.id)}>
                  Detail
                </Button>
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
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">
                    Transfer: <span className="text-brand-600">{detail.header.docNo}</span>
                  </h3>
                  <p className="text-sm text-slate-500">{detail.header.docDate}</p>
                  <p className="text-sm text-slate-600">
                    {detail.header.fromWarehouse} → {detail.header.toWarehouse}
                  </p>
                  {detail.header.notes ? (
                    <p className="text-xs text-slate-500">Catatan: {detail.header.notes}</p>
                  ) : null}
                </div>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-left text-white">
                      <th className="px-3 py-2">Produk</th>
                      <th className="px-3 py-2 text-center">Qty</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 flex justify-end">
                  <Button type="button" variant="ghost" onClick={() => setDetailOpen(false)}>
                    Tutup
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
