"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

type ReceiptItem = {
  id: string;
  receiptNo: string;
  receiptDate: string;
  supplierName: string;
  outletCode: string | null;
  totalQty: number;
  lineCount: number;
};

type SettlementItem = {
  id: string;
  settlementNo: string;
  settlementDate: string;
  supplierName: string;
  total: number;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

export function ConsignmentHistoryClient() {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [settlements, setSettlements] = useState<SettlementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, setRes] = await Promise.all([
        fetch("/api/inventory/consignment/receipts"),
        fetch("/api/inventory/consignment/settlements")
      ]);
      const recData = await recRes.json();
      const setData = await setRes.json();
      if (!recRes.ok) throw new Error(recData.error || "Gagal memuat penerimaan");
      if (!setRes.ok) throw new Error(setData.error || "Gagal memuat settlement");
      setReceipts(recData.items || []);
      setSettlements(setData.settlements || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Riwayat Titip Jual"
        description="Penerimaan barang titip dan pelunasan ke supplier"
      />
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Memuat…</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Penerimaan titip</h2>
          {!receipts.length ? (
            <p className="text-sm text-slate-500">Belum ada penerimaan.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {receipts.map((r) => (
                <li key={r.id} className="rounded border border-slate-100 p-2">
                  <div className="font-medium">{r.receiptNo}</div>
                  <div className="text-slate-600">
                    {r.receiptDate} · {r.supplierName}
                    {r.outletCode ? ` · ${r.outletCode}` : ""}
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.lineCount} produk · qty {r.totalQty}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Pelunasan titip</h2>
          {!settlements.length ? (
            <p className="text-sm text-slate-500">Belum ada settlement.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {settlements.map((s) => (
                <li key={s.id} className="rounded border border-slate-100 p-2">
                  <div className="font-medium">{s.settlementNo}</div>
                  <div className="text-slate-600">
                    {s.settlementDate} · {s.supplierName}
                  </div>
                  <div className="text-xs text-slate-500">{formatRp(s.total)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
