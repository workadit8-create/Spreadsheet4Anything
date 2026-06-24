"use client";

import { useState } from "react";

type PaymentStatus = "PENJUALAN TUNAI" | "PENJUALAN KREDIT";

export function InvoiceCreateForm({ onCreated }: { onCreated: () => void }) {
  const [keterangan, setKeterangan] = useState("Penjualan lab Premium Web");
  const [total, setTotal] = useState("50000");
  const [bayar, setBayar] = useState("50000");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("PENJUALAN TUNAI");
  const [rekening, setRekening] = useState("Kas");
  const [akunPendapatan, setAkunPendapatan] = useState("Pendapatan");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keterangan,
          total: Number(total),
          bayar: Number(bayar),
          paymentStatus,
          rekening,
          akunPendapatan
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal buat invoice");

      const processRes = await fetch("/api/posting/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryFailed: true })
      });
      const processData = await processRes.json();
      if (!processRes.ok) {
        setMessage(`Invoice ${data.order.order_no} dibuat. Posting: ${processData.error}`);
      } else {
        const ok = processData.results?.some((r: { ok: boolean }) => r.ok);
        const synced = processData.results?.some((r: { sheetSynced?: boolean }) => r.sheetSynced);
        setMessage(
          ok
            ? synced
              ? `Invoice ${data.order.order_no} → jurnal POSTED + sheet PEMASUKAN`
              : `Invoice ${data.order.order_no} → jurnal POSTED (sheet sync pending — deploy backend-hybrid)`
            : `Invoice ${data.order.order_no} dibuat. Posting: ${processData.results?.[0]?.error || "cek queue"}`
        );
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Keterangan</label>
        <input
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Total (Rp)</label>
          <input
            type="number"
            min={1}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Bayar (Rp)</label>
          <input
            type="number"
            min={0}
            value={bayar}
            onChange={(e) => setBayar(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Status pembayaran</label>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
            style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
          >
            <option value="PENJUALAN TUNAI">PENJUALAN TUNAI</option>
            <option value="PENJUALAN KREDIT">PENJUALAN KREDIT</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Rekening (Kas/Bank)</label>
          <input
            value={rekening}
            onChange={(e) => setRekening(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
          />
        </div>
      </div>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Akun pendapatan</label>
        <input
          value={akunPendapatan}
          onChange={(e) => setAkunPendapatan(e.target.value)}
          style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
        />
      </div>
      {message && <p style={{ color: "#059669", fontSize: 13 }}>{message}</p>}
      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: 10,
          background: "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer"
        }}
      >
        {loading ? "Memproses..." : "Buat invoice + post ke jurnal"}
      </button>
    </form>
  );
}
