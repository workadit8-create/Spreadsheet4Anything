"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

type PiutangItem = {
  salesOrderId: string;
  invoiceNo: string;
  orderDate: string;
  customerName: string;
  grandTotal: number;
  sisaTagihan: number;
};

type Customer = { id: string; code: string | null; name: string };
type KasBank = { id: string; name: string; coa_account_name?: string };

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export default function PiutangPageClient() {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<PiutangItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalPiutang, setTotalPiutang] = useState(0);
  const [kasBank, setKasBank] = useState<KasBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payTarget, setPayTarget] = useState<PiutangItem | null>(null);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payNominal, setPayNominal] = useState("");
  const [payRekening, setPayRekening] = useState("Kas");
  const [payKeterangan, setPayKeterangan] = useState("");
  const [paying, setPaying] = useState(false);
  const [payMessage, setPayMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      if (customerId) params.set("customer_id", customerId);
      const res = await fetch(`/api/piutang?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat piutang");
      setItems(data.items || []);
      setTotalPiutang(data.totalPiutang || 0);
      setCustomers(data.customers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setItems([]);
      setTotalPiutang(0);
    } finally {
      setLoading(false);
    }
  }, [start, end, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/piutang/kas-bank")
      .then((r) => r.json())
      .then((data) => {
        const items = data.items || [];
        setKasBank(items);
        const kas = items.find((k: KasBank) => k.name.toLowerCase() === "kas") || items[0];
        if (kas) setPayRekening(kas.name);
      })
      .catch(() => undefined);
  }, []);

  function openPay(row: PiutangItem) {
    setPayTarget(row);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNominal(String(row.sisaTagihan));
    setPayKeterangan("");
    setPayMessage(null);
  }

  async function submitPelunasan() {
    if (!payTarget) return;
    const nominal = Number(payNominal);
    if (!nominal || nominal <= 0) {
      setPayMessage("Nominal tidak valid");
      return;
    }
    if (nominal > payTarget.sisaTagihan) {
      setPayMessage(`Maksimal ${formatRp(payTarget.sisaTagihan)}`);
      return;
    }

    setPaying(true);
    setPayMessage(null);
    try {
      const res = await fetch("/api/piutang/pelunasan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales_order_id: payTarget.salesOrderId,
          tanggal: payDate,
          nominal,
          rekening: payRekening,
          keterangan: payKeterangan
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const processRes = await fetch("/api/posting/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryFailed: true })
      });
      const processData = await processRes.json();
      const ok = processData.results?.some((r: { ok: boolean }) => r.ok);
      const synced = processData.results?.some((r: { sheetSynced?: boolean }) => r.sheetSynced);

      setPayMessage(
        ok
          ? synced
            ? `Pelunasan ${payTarget.invoiceNo} → jurnal POSTED + sheet`
            : `Pelunasan ${payTarget.invoiceNo} → jurnal POSTED (sync sheet — deploy backend-hybrid)`
          : `Pelunasan disimpan. Posting: ${processData.results?.[0]?.error || "cek queue"}`
      );

      setPayTarget(null);
      await load();
    } catch (e) {
      setPayMessage(e instanceof Error ? e.message : "Gagal pelunasan");
    } finally {
      setPaying(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Piutang"
        title="Daftar piutang"
        description="Invoice kredit / kurang bayar → pelunasan → jurnal + sheet PELUNASAN_PIUTANG"
      />

      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label>Dari tanggal</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>Sampai tanggal</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <Label>Customer</Label>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Semua</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ` : ""}{c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={load}>Cari tagihan</Button>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3">
          <span className="text-sm text-red-800">Total piutang (filter): </span>
          <strong className="text-lg text-red-900">{formatRp(totalPiutang)}</strong>
        </div>
      </Card>

      <Card>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-500">Memuat piutang...</p>
        ) : !items.length ? (
          <p className="text-sm text-slate-500">Tidak ada piutang outstanding di rentang ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Sisa</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => (
                  <tr key={row.salesOrderId} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">{row.orderDate}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.invoiceNo}</td>
                    <td className="px-4 py-3">{row.customerName || "—"}</td>
                    <td className="px-4 py-3">{formatRp(row.grandTotal)}</td>
                    <td className="px-4 py-3 font-semibold text-red-700">{formatRp(row.sisaTagihan)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openPay(row)}
                        className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                      >
                        Bayar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Pelunasan piutang</h3>
            <p className="mt-1 text-sm text-slate-500">
              Invoice <strong>{payTarget.invoiceNo}</strong> · {payTarget.customerName}
            </p>
            <p className="mt-2 text-sm font-semibold text-red-700">
              Sisa: {formatRp(payTarget.sisaTagihan)}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <Label>Tanggal bayar</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
          <div>
            <Label>Masuk ke rekening</Label>
            <Select value={payRekening} onChange={(e) => setPayRekening(e.target.value)}>
              {kasBank.length ? (
                kasBank.map((k) => (
                  <option key={k.id} value={k.name}>
                    {k.name}{k.coa_account_name ? ` (${k.coa_account_name})` : ""}
                  </option>
                ))
              ) : (
                <option value="">Tambah rekening di Master Kas & Bank</option>
              )}
            </Select>
          </div>
              <div>
                <Label>Nominal</Label>
                <Input
                  type="number"
                  min={1}
                  max={payTarget.sisaTagihan}
                  value={payNominal}
                  onChange={(e) => setPayNominal(e.target.value)}
                />
              </div>
              <div>
                <Label>Keterangan</Label>
                <Input
                  value={payKeterangan}
                  onChange={(e) => setPayKeterangan(e.target.value)}
                  placeholder="Opsional"
                />
              </div>
            </div>

            {payMessage && <p className="mt-3 text-sm text-slate-600">{payMessage}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPayTarget(null)} disabled={paying}>
                Batal
              </Button>
              <Button type="button" onClick={submitPelunasan} disabled={paying}>
                {paying ? "Memproses..." : "Simpan pembayaran"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
