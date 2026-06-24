"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { computeLineTotal } from "@/lib/posting/invoice-lines";

type Customer = { id: string; code: string | null; name: string };
type Product = {
  id: string;
  sku: string | null;
  name: string;
  sell_price: number;
  unit_code: string;
  akunPendapatan: string;
};
type KasBank = { id: string; code: string | null; name: string };
type PaymentMode = "TUNAI" | "KREDIT" | "PARTIAL";

type LineState = {
  key: string;
  product_id: string;
  qty: string;
  unit_price: string;
  diskon: string;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function emptyLine(): LineState {
  return {
    key: `${Date.now()}-${Math.random()}`,
    product_id: "",
    qty: "1",
    unit_price: "",
    diskon: "0"
  };
}

export function InvoiceProperForm({ onCreated }: { onCreated: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [kasBank, setKasBank] = useState<KasBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState("");
  const [rekening, setRekening] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("TUNAI");
  const [bayar, setBayar] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const lineTotals = lines.map((line) => {
    const qty = Number(line.qty) || 0;
    const price = Number(line.unit_price) || 0;
    const diskon = Number(line.diskon) || 0;
    return computeLineTotal(qty, price, diskon);
  });

  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const bayarNum =
    paymentMode === "TUNAI"
      ? subtotal
      : paymentMode === "KREDIT"
        ? 0
        : Math.min(subtotal, Math.max(0, Number(bayar) || 0));
  const kurangBayar = Math.max(0, subtotal - bayarNum);
  const paymentLabel =
    paymentMode === "KREDIT" || kurangBayar > 0.01
      ? "PENJUALAN KREDIT"
      : "PENJUALAN TUNAI";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices/bootstrap");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data");
      setCustomers(data.customers || []);
      setProducts(data.products || []);
      setKasBank(data.kasBank || []);
      if (data.kasBank?.length) {
        setRekening(data.kasBank[0].name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.product_id) {
          const product = productMap.get(patch.product_id);
          if (product) {
            next.unit_price = String(product.sell_price);
          }
        }
        return next;
      })
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError("Pilih customer");
      return;
    }
    const validLines = lines.filter((l) => l.product_id);
    if (!validLines.length) {
      setError("Minimal satu produk");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          order_date: orderDate,
          bayar: bayarNum,
          rekening,
          lines: validLines.map((l) => ({
            product_id: l.product_id,
            qty: Number(l.qty),
            unit_price: Number(l.unit_price),
            diskon: Number(l.diskon) || 0
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal buat invoice");

      setMessage(
        `Invoice ${data.order.order_no} disimpan (CONFIRMED). Klik Post jurnal di daftar invoice.`
      );

      setLines([emptyLine()]);
      setCustomerId("");
      setBayar("");
      setPaymentMode("TUNAI");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Memuat customer & produk...</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Tanggal</Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
        </div>
        <div>
          <Label>Customer</Label>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">Pilih customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ` : ""}{c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Masuk ke rekening</Label>
          <Select value={rekening} onChange={(e) => setRekening(e.target.value)}>
            <option value="">—</option>
            {kasBank.map((k) => (
              <option key={k.id} value={k.name}>{k.name}</option>
            ))}
            {!kasBank.length && <option value="Kas">Kas</option>}
          </Select>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Detail produk</h3>
          <Button type="button" variant="secondary" onClick={addLine}>+ Baris</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Produk</th>
                <th className="px-3 py-2 w-20">Qty</th>
                <th className="px-3 py-2 w-28">Harga</th>
                <th className="px-3 py-2 w-24">Diskon</th>
                <th className="px-3 py-2 w-28">Total</th>
                <th className="px-3 py-2 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, index) => {
                const product = line.product_id ? productMap.get(line.product_id) : null;
                return (
                  <tr key={line.key}>
                    <td className="px-3 py-2">
                      <Select
                        value={line.product_id}
                        onChange={(e) => updateLine(line.key, { product_id: e.target.value })}
                      >
                        <option value="">Pilih produk</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku ? `${p.sku} — ` : ""}{p.name}
                          </option>
                        ))}
                      </Select>
                      {product && (
                        <p className="mt-1 text-xs text-slate-400">{product.unit_code} · {product.akunPendapatan}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0.01}
                        step="any"
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={line.unit_price}
                        onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={line.diskon}
                        onChange={(e) => updateLine(line.key, { diskon: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {formatRp(lineTotals[index])}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Hapus baris"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <div className="mx-auto max-w-md space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <strong>{formatRp(subtotal)}</strong>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Tipe pembayaran</p>
            <div className="flex flex-wrap gap-2">
              {(["TUNAI", "KREDIT", "PARTIAL"] as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPaymentMode(mode);
                    if (mode === "TUNAI") setBayar("");
                    if (mode === "KREDIT") setBayar("0");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    paymentMode === mode
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {mode === "TUNAI" ? "Lunas tunai" : mode === "KREDIT" ? "Kredit penuh" : "Kurang bayar"}
                </button>
              ))}
            </div>
          </div>
          {paymentMode === "PARTIAL" && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600">Bayar sekarang</span>
              <Input
                type="number"
                min={0}
                max={subtotal}
                className="max-w-[140px]"
                value={bayar}
                onChange={(e) => setBayar(e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>Bayar (efektif)</span>
            <strong>{formatRp(bayarNum)}</strong>
          </div>
          <div className="flex justify-between text-amber-700">
            <span>Kurang bayar · {paymentLabel}</span>
            <strong>{formatRp(kurangBayar)}</strong>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <Button type="submit" disabled={saving || !products.length}>
        {saving ? "Memproses..." : "Simpan invoice"}
      </Button>
      {!products.length && (
        <p className="text-xs text-slate-500">Tambah produk di Master Data terlebih dahulu.</p>
      )}
    </form>
  );
}
