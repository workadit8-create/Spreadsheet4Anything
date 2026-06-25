"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { ProjectSelect } from "@/components/proyek/ProjectSelect";
import type { ProjectOption } from "@/lib/proyek/bootstrap-options";
import { PageHeader } from "@/components/ui/PageHeader";
import { computeLineTotal } from "@/lib/posting/invoice-lines";

type Tab = "buat" | "riwayat";
type Customer = { id: string; code: string | null; name: string };
type Product = { id: string; sku: string | null; name: string; sell_price: number; unit_code: string };

type LineState = {
  key: string;
  product_id: string;
  qty: string;
  unit_price: string;
  diskon: string;
};

type HistoryRow = {
  id: string;
  quotationNo: string;
  quotationDate: string;
  customerName: string;
  status: string;
  total: number;
  convertedOrderNo: string;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function emptyLine(): LineState {
  return { key: `${Date.now()}-${Math.random()}`, product_id: "", qty: "1", unit_price: "", diskon: "0" };
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function statusClass(status: string) {
  if (status === "CONVERTED") return "text-emerald-600";
  if (status === "CANCELLED") return "text-red-600";
  return "text-amber-600";
}

export default function QuotationPageClient() {
  const [tab, setTab] = useState<Tab>("buat");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [quotationDate, setQuotationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [projectCode, setProjectCode] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const defaults = useMemo(() => defaultDateRange(), []);
  const [histStart, setHistStart] = useState(defaults.start);
  const [histEnd, setHistEnd] = useState(defaults.end);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lineTotals = lines.map((line) => {
    const qty = Number(line.qty) || 0;
    const price = Number(line.unit_price) || 0;
    const diskon = Number(line.diskon) || 0;
    return computeLineTotal(qty, price, diskon);
  });
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);

  const loadMaster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices/bootstrap");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data");
      setCustomers(data.customers || []);
      setProducts(data.products || []);
      setProjectOptions(data.projectAddon?.options || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const params = new URLSearchParams({ start: histStart, end: histEnd });
      const res = await fetch(`/api/quotations?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistory(data.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat riwayat");
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  }, [histStart, histEnd]);

  useEffect(() => {
    loadMaster();
  }, [loadMaster]);

  useEffect(() => {
    if (tab === "riwayat") loadHistory();
  }, [tab, loadHistory]);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.product_id) {
          const product = productMap.get(patch.product_id);
          if (product) next.unit_price = String(product.sell_price);
        }
        return next;
      })
    );
  }

  async function submit(e: React.FormEvent) {
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
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          quotation_date: quotationDate,
          keterangan,
          project_code: projectCode || undefined,
          lines: validLines.map((l) => ({
            product_id: l.product_id,
            qty: Number(l.qty),
            unit_price: Number(l.unit_price),
            diskon: Number(l.diskon) || 0
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage(data.message || `Quotation ${data.quotation.quotation_no} disimpan.`);
      setLines([emptyLine()]);
      setCustomerId("");
      setKeterangan("");
      setProjectCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Penjualan · Quotation"
        title="Quotation"
        description="Penawaran harga ke customer — belum jurnal. Konversi ke invoice dari menu Penjualan."
      >
        <Link href="/dashboard/penjualan" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Buat invoice →
        </Link>
      </PageHeader>

      <div className="mb-6 flex gap-2">
        {(["buat", "riwayat"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t === "buat" ? "Buat quotation" : "Riwayat"}
          </button>
        ))}
      </div>

      {tab === "buat" ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Quotation baru</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Memuat data...</p>
          ) : (
            <form onSubmit={submit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Tanggal</Label>
                  <Input
                    type="date"
                    value={quotationDate}
                    onChange={(e) => setQuotationDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Customer</Label>
                  <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                    <option value="">Pilih customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `${c.code} — ` : ""}
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <ProjectSelect
                options={projectOptions}
                value={projectCode}
                onChange={setProjectCode}
              />
              <div>
                <Label>Keterangan (opsional)</Label>
                <Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Detail produk</h3>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setLines((prev) => [...prev, emptyLine()])}
                  >
                    + Baris
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Produk</th>
                        <th className="w-20 px-3 py-2">Qty</th>
                        <th className="w-28 px-3 py-2">Harga</th>
                        <th className="w-24 px-3 py-2">Diskon</th>
                        <th className="w-28 px-3 py-2">Total</th>
                        <th className="w-12 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((line, index) => (
                        <tr key={line.key}>
                          <td className="px-3 py-2">
                            <Select
                              value={line.product_id}
                              onChange={(e) => updateLine(line.key, { product_id: e.target.value })}
                            >
                              <option value="">Pilih produk</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.sku ? `${p.sku} — ` : ""}
                                  {p.name}
                                </option>
                              ))}
                            </Select>
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
                          <td className="px-3 py-2 font-medium">{formatRp(lineTotals[index])}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setLines((prev) =>
                                  prev.length <= 1 ? prev : prev.filter((l) => l.key !== line.key)
                                )
                              }
                              className="text-slate-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end text-sm">
                <span className="text-slate-600">Total estimasi&nbsp;</span>
                <strong>{formatRp(subtotal)}</strong>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {message && <p className="text-sm text-emerald-600">{message}</p>}

              <Button type="submit" disabled={saving || !products.length}>
                {saving ? "Menyimpan..." : "Simpan quotation"}
              </Button>
            </form>
          )}
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <Label>Dari</Label>
              <Input type="date" value={histStart} onChange={(e) => setHistStart(e.target.value)} />
            </div>
            <div>
              <Label>Sampai</Label>
              <Input type="date" value={histEnd} onChange={(e) => setHistEnd(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" onClick={loadHistory} disabled={histLoading}>
              {histLoading ? "Memuat..." : "Filter"}
            </Button>
          </div>

          {histLoading ? (
            <p className="text-sm text-slate-500">Memuat riwayat...</p>
          ) : !history.length ? (
            <p className="text-sm text-slate-500">Belum ada quotation.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">No</th>
                    <th className="py-2 pr-3">Tanggal</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-3 font-medium">{row.quotationNo}</td>
                      <td className="py-2 pr-3">{row.quotationDate}</td>
                      <td className="py-2 pr-3">{row.customerName}</td>
                      <td className="py-2 pr-3">{formatRp(row.total)}</td>
                      <td className={`py-2 pr-3 font-medium ${statusClass(row.status)}`}>{row.status}</td>
                      <td className="py-2">{row.convertedOrderNo || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
