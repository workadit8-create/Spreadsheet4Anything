"use client";

import { useCallback, useEffect, useState } from "react";

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
  metadata: { transactionId?: string };
  postingJob: PostingJob | null;
};

function statusColor(status: string) {
  if (status === "POSTED") return "#059669";
  if (status === "FAILED") return "#dc2626";
  if (status === "RUNNING") return "#d97706";
  return "#64748b";
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
    return <p style={{ color: "#64748b", fontSize: 14 }}>Memuat invoice...</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Invoice terbaru</h2>
        <button
          type="button"
          onClick={processQueue}
          disabled={processing}
          style={{
            padding: "6px 12px",
            fontSize: 13,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#fff",
            cursor: processing ? "wait" : "pointer"
          }}
        >
          {processing ? "Memproses..." : "Proses queue"}
        </button>
      </div>
      {message && <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>{message}</p>}
      {!orders.length ? (
        <p style={{ color: "#64748b", fontSize: 14 }}>Belum ada invoice.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b" }}>
              <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>Invoice</th>
              <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>Total</th>
              <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>Order</th>
              <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>Posting</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const postStatus = o.postingJob?.status || "—";
              return (
                <tr key={o.id}>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>
                    <code style={{ fontSize: 12 }}>{o.order_no}</code>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{o.metadata?.transactionId}</div>
                  </td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>
                    {Number(o.total).toLocaleString("id-ID")}
                  </td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>{o.status}</td>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ color: statusColor(postStatus), fontWeight: 600 }}>{postStatus}</span>
                    {o.postingJob?.last_error && (
                      <div style={{ fontSize: 11, color: "#dc2626" }}>{o.postingJob.last_error}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
