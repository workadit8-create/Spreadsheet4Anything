"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type PostingJob = {
  id: string;
  status: string;
  last_error: string | null;
};

type OrderRow = {
  id: string;
  order_no: string;
  order_date: string;
  total: number;
  status: string;
  customerName?: string;
  metadata: { transactionId?: string; customerName?: string };
  postingJob: PostingJob | null;
};

function orderStatusClass(status: string) {
  if (status === "POSTED") return "text-emerald-600";
  if (status === "VOIDED") return "text-red-600";
  if (status === "CONFIRMED") return "text-amber-600";
  return "text-slate-500";
}

export function InvoiceListPanel() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
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

  async function postOrder(order: OrderRow) {
    setActingId(order.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/sales-orders/${order.id}/post`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || `Invoice ${order.order_no} diposting`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal posting");
    } finally {
      setActingId(null);
    }
  }

  async function voidOrder(order: OrderRow) {
    const reason = window.prompt(`Alasan batal invoice ${order.order_no}?`, "Input salah");
    if (reason === null) return;

    setActingId(order.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/sales-orders/${order.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || `Invoice ${order.order_no} dibatalkan`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal void");
    } finally {
      setActingId(null);
    }
  }

  async function deleteOrder(order: OrderRow) {
    if (!window.confirm(`Hapus invoice ${order.order_no}? (belum posting jurnal)`)) return;

    setActingId(order.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/sales-orders/${order.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Invoice dihapus");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal hapus");
    } finally {
      setActingId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Memuat invoice...</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Invoice terbaru</h2>
        <p className="text-xs text-slate-500">CONFIRMED → Posting · POSTED → Batal (void)</p>
      </div>
      {message && <p className="mb-3 text-sm text-slate-600">{message}</p>}
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
                <th className="border-b border-slate-200 px-2 py-2">Status</th>
                <th className="border-b border-slate-200 px-2 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const busy = actingId === o.id;
                return (
                  <tr key={o.id} className="hover:bg-slate-50/80">
                    <td className="border-b border-slate-100 px-2 py-2 text-slate-700">
                      {o.customerName || o.metadata?.customerName || "—"}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      <code className="text-xs">{o.order_no}</code>
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      {Number(o.total).toLocaleString("id-ID")}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      <span className={`font-semibold ${orderStatusClass(o.status)}`}>
                        {o.status}
                      </span>
                      {o.postingJob?.last_error && o.status === "CONFIRMED" && (
                        <div className="text-xs text-red-600">{o.postingJob.last_error}</div>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {o.status === "CONFIRMED" && (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => postOrder(o)}
                            >
                              {busy ? "..." : "Post jurnal"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => deleteOrder(o)}
                            >
                              Hapus
                            </Button>
                          </>
                        )}
                        {o.status === "POSTED" && (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => voidOrder(o)}
                          >
                            {busy ? "..." : "Batal"}
                          </Button>
                        )}
                        {o.status === "VOIDED" && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
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
