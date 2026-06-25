"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { computePurchaseLineTotal } from "@/lib/posting/purchase-lines";

type Tab = "buat" | "riwayat";
type Supplier = { id: string; code: string | null; name: string };
type Category = { id: string; label: string };

type LineState = {
  key: string;
  description: string;
  purchase_category_id: string;
  qty: string;
  unit_cost: string;
  diskon: string;
  unit_code: string;
};

type HistoryRow = {
  id: string;
  prNo: string;
  requestDate: string;
  supplierName: string;
  status: string;
  total: number;
  convertedPoNo: string;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function emptyLine(catId = ""): LineState {
  return {
    key: `${Date.now()}-${Math.random()}`,
    description: "",
    purchase_category_id: catId,
    qty: "1",
    unit_cost: "",
    diskon: "0",
    unit_code: "PCS"
  };
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

export default function PurchaseRequestPageClient() {
  const [tab, setTab] = useState<Tab>("buat");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const defaults = useMemo(() => defaultDateRange(), []);
  const [histStart, setHistStart] = useState(defaults.start);
  const [histEnd, setHistEnd] = useState(defaults.end);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const lineTotals = lines.map((line) => {
    const qty = Number(line.qty) || 0;
    const cost = Number(line.unit_cost) || 0;
    const diskon = Number(line.diskon) || 0;
    return computePurchaseLineTotal(qty, cost, diskon);
  });
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);

  const loadMaster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pembelian/bootstrap");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data");
      setSuppliers(data.suppliers || []);
      setCategories(data.purchaseCategories || []);
      const catId = data.purchaseCategories?.[0]?.id || "";
      setLines((prev) =>
        prev.map((l) => (l.purchase_category_id ? l : { ...l, purchase_category_id: catId }))
      );
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
      const res = await fetch(`/api/purchase-requests?${params}`);
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
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter((l) => l.description.trim() && l.purchase_category_id);
    if (!validLines.length) {
      setError("Minimal satu barang dengan kategori");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId || undefined,
          request_date: requestDate,
          keterangan,
          lines: validLines.map((l) => ({
            description: l.description.trim(),
            purchase_category_id: l.purchase_category_id,
            qty: Number(l.qty),
            unit_cost: Number(l.unit_cost) || 0,
            diskon: Number(l.diskon) || 0,
            unit_code: l.unit_code
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage(data.message || `PR ${data.purchaseRequest.pr_no} disimpan.`);
      const catId = categories[0]?.id || "";
      setLines([emptyLine(catId)]);
      setSupplierId("");
      setKeterangan("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Pembelian · Purchase Request"
        title="Purchase Request"
        description="Permintaan pembelian internal — belum jurnal. Konversi ke PO dari menu Pembelian."
      >
        <Link href="/dashboard/pembelian" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Buat PO →
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
            {t === "buat" ? "Buat PR" : "Riwayat"}
          </button>
        ))}
      </div>

      {tab === "buat" ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Purchase Request baru</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Memuat data...</p>
          ) : (
            <form onSubmit={submit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Tanggal</Label>
                  <Input
                    type="date"
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Supplier (opsional)</Label>
                  <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">— belum ditentukan —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `${s.code} — ` : ""}
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label>Keterangan (opsional)</Label>
                <Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Detail barang</h3>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setLines((prev) => [...prev, emptyLine(categories[0]?.id || "")])}
                  >
                    + Baris
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Kategori</th>
                        <th className="px-3 py-2">Nama barang</th>
                        <th className="w-20 px-3 py-2">Qty</th>
                        <th className="w-28 px-3 py-2">Est. harga</th>
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
                              value={line.purchase_category_id}
                              onChange={(e) => updateLine(line.key, { purchase_category_id: e.target.value })}
                            >
                              <option value="">Pilih kategori</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={line.description}
                              onChange={(e) => updateLine(line.key, { description: e.target.value })}
                              placeholder="Nama barang"
                            />
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
                              value={line.unit_cost}
                              onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
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

              <Button type="submit" disabled={saving || !categories.length}>
                {saving ? "Menyimpan..." : "Simpan PR"}
              </Button>
              {!categories.length && (
                <p className="text-xs text-slate-500">Tambah kategori pembelian di Master Data.</p>
              )}
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
            <p className="text-sm text-slate-500">Belum ada purchase request.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">No PR</th>
                    <th className="py-2 pr-3">Tanggal</th>
                    <th className="py-2 pr-3">Supplier</th>
                    <th className="py-2 pr-3">Total estimasi</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">PO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-3 font-medium">{row.prNo}</td>
                      <td className="py-2 pr-3">{row.requestDate}</td>
                      <td className="py-2 pr-3">{row.supplierName || "—"}</td>
                      <td className="py-2 pr-3">{formatRp(row.total)}</td>
                      <td className={`py-2 pr-3 font-medium ${statusClass(row.status)}`}>{row.status}</td>
                      <td className="py-2">{row.convertedPoNo || "—"}</td>
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
