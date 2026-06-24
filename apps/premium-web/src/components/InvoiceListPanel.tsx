"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type PostingJob = {
  id: string;
  status: string;
  last_error: string | null;
  engine_ref: string | null;
  attempts: number;
};

type OrderRow = {
  id: string;
  order_no: string;
  order_date: string;
  total: number;
  status: string;
  customerName?: string;
  invoiceMode?: string;
  metadata: { transactionId?: string; sheetSynced?: boolean; customerName?: string };
  postingJob: PostingJob | null;
};

function statusClass(status: string) {
  if (status === "POSTED") return "text-emerald-600";
  if (status === "FAILED") return "text-red-600";
  if (status === "RUNNING") return "text-amber-600";
  return "text-slate-500";
}

export function InvoiceListPanel() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales-orders");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrders(data.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function processQueue() {
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/posting/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryFailed: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const ok = (data.results || []).filter((r: { ok: boolean }) => r.ok).length;
      const fail = (data.results || []).filter((r: { ok: boolean }) => !r.ok).length;
      setMessage(`Diproses: ${data.processed} (OK: ${ok}, gagal: ${fail})`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal proses queue");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Memuat invoice...</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Invoice terbaru</h2>
        <Button variant="secondary" type="button" onClick={processQueue} disabled={processing}>
          {processing ? "Memproses..." : "Proses queue"}
        </Button>
      </div>
      {message && <p className="mb-3 text-sm text-slate-500">{message}</p>}
      {!orders.length ? (
        <p className="text-sm text-slate-500">Belum ada invoice.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500">
                <th className="border-b border-slate-200 px-2 py-2">Customer</th>
                <th className="border-b border-slate-200 px-2 py-2">Invoice</th>
                <th className="border-b border-slate-200 px-2 py-2">Total</th>
                <th className="border-b border-slate-200 px-2 py-2">Order</th>
                <th className="border-b border-slate-200 px-2 py-2">Posting</th>
                <th className="border-b border-slate-200 px-2 py-2">Sheet</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const postStatus = o.postingJob?.status || "—";
                return (
                  <tr key={o.id} className="hover:bg-slate-50/80">
                    <td className="border-b border-slate-100 px-2 py-2 text-slate-700">
                      {o.customerName || o.metadata?.customerName || "—"}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      <code className="text-xs">{o.order_no}</code>
                      <div className="text-xs text-slate-400">{o.metadata?.transactionId}</div>
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      {Number(o.total).toLocaleString("id-ID")}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">{o.status}</td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      <span className={`font-semibold ${statusClass(postStatus)}`}>{postStatus}</span>
                      {o.postingJob?.last_error && (
                        <div className="text-xs text-red-600">{o.postingJob.last_error}</div>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      <span
                        className={`font-semibold ${
                          o.metadata?.sheetSynced ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {o.metadata?.sheetSynced ? "SYNCED" : postStatus === "POSTED" ? "PENDING" : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
