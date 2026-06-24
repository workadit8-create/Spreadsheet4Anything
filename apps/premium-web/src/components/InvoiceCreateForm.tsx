"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";

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
    <form onSubmit={onSubmit} className="grid gap-4">
      <div>
        <Label>Keterangan</Label>
        <Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Total (Rp)</Label>
          <Input type="number" min={1} value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div>
          <Label>Bayar (Rp)</Label>
          <Input type="number" min={0} value={bayar} onChange={(e) => setBayar(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Status pembayaran</Label>
          <Select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
          >
            <option value="PENJUALAN TUNAI">PENJUALAN TUNAI</option>
            <option value="PENJUALAN KREDIT">PENJUALAN KREDIT</option>
          </Select>
        </div>
        <div>
          <Label>Rekening (Kas/Bank)</Label>
          <Input value={rekening} onChange={(e) => setRekening(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Akun pendapatan</Label>
        <Input value={akunPendapatan} onChange={(e) => setAkunPendapatan(e.target.value)} />
      </div>
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? "Memproses..." : "Buat invoice + post ke jurnal"}
      </Button>
    </form>
  );
}
