"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { computePurchaseLineTotal } from "@/lib/posting/purchase-lines";

type Supplier = { id: string; code: string | null; name: string };
type Category = { id: string; label: string; coa_account: string };
type KasBank = { id: string; name: string };
type PaymentMode = "TUNAI" | "KREDIT" | "PARTIAL";

type LineState = {
  key: string;
  description: string;
  purchase_category_id: string;
  qty: string;
  unit_cost: string;
  diskon: string;
  unit_code: string;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function emptyLine(): LineState {
  return {
    key: `${Date.now()}-${Math.random()}`,
    description: "",
    purchase_category_id: "",
    qty: "1",
    unit_cost: "",
    diskon: "0",
    unit_code: "PCS"
  };
}

export function PembelianForm({ onCreated }: { onCreated?: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kasBank, setKasBank] = useState<KasBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [rekening, setRekening] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("TUNAI");
  const [bayar, setBayar] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const lineTotals = lines.map((line) => {
    const qty = Number(line.qty) || 0;
    const cost = Number(line.unit_cost) || 0;
    const diskon = Number(line.diskon) || 0;
    return computePurchaseLineTotal(qty, cost, diskon);
  });

  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const bayarNum =
    paymentMode === "TUNAI"
      ? subtotal
      : paymentMode === "KREDIT"
        ? 0
        : Math.min(subtotal, Math.max(0, Number(bayar) || 0));
  const kurangBayar = Math.max(0, subtotal - bayarNum);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pembelian/bootstrap");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data");
      setSuppliers(data.suppliers || []);
      setCategories(data.purchaseCategories || []);
      setKasBank(data.kasBank || []);
      if (data.kasBank?.length) setRekening(data.kasBank[0].name);
      if (data.purchaseCategories?.length) {
        setLines((prev) =>
          prev.map((l) =>
            l.purchase_category_id ? l : { ...l, purchase_category_id: data.purchaseCategories[0].id }
          )
        );
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
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const catId = categories[0]?.id || "";
    setLines((prev) => [...prev, { ...emptyLine(), purchase_category_id: catId }]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setError("Pilih supplier");
      return;
    }
    if (!lines.every((l) => l.description.trim() && l.purchase_category_id)) {
      setError("Lengkapi barang dan kategori di setiap baris");
      return;
    }
    if (subtotal <= 0) {
      setError("Total harus > 0");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId,
          order_date: orderDate,
          bayar: bayarNum,
          rekening: bayarNum > 0 ? rekening : "",
          lines: lines.map((l) => ({
            description: l.description.trim(),
            purchase_category_id: l.purchase_category_id,
            qty: Number(l.qty) || 1,
            unit_cost: Number(l.unit_cost) || 0,
            diskon: Number(l.diskon) || 0,
            unit_code: l.unit_code || "PCS"
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage(data.message || `PO ${data.order?.po_no} disimpan`);
      setLines([{ ...emptyLine(), purchase_category_id: categories[0]?.id || "" }]);
      setBayar("");
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Memuat data master...</p>;

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Tanggal</Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        <div>
          <Label>Supplier</Label>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">Pilih supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>Barang / jasa</Label>
          <Button type="button" variant="ghost" onClick={addLine}>+ Baris</Button>
        </div>
        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div key={line.key} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Baris {idx + 1}</span>
                {lines.length > 1 && (
                  <button type="button" className="text-xs text-red-500" onClick={() => removeLine(line.key)}>
                    Hapus
                  </button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <Input
                    placeholder="Nama barang / jasa"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </div>
                <div>
                  <Select
                    value={line.purchase_category_id}
                    onChange={(e) => updateLine(line.key, { purchase_category_id: e.target.value })}
                  >
                    <option value="">Kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Qty"
                    value={line.qty}
                    onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Harga"
                    value={line.unit_cost}
                    onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Diskon"
                    value={line.diskon}
                    onChange={(e) => updateLine(line.key, { diskon: e.target.value })}
                  />
                </div>
              </div>
              <p className="mt-1 text-right text-xs text-slate-500">
                Subtotal baris: {formatRp(lineTotals[idx] || 0)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 p-4">
        <p className="text-lg font-semibold">Total: {formatRp(subtotal)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["TUNAI", "KREDIT", "PARTIAL"] as PaymentMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaymentMode(mode)}
              className={`rounded-full px-3 py-1 text-sm ${
                paymentMode === mode ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200"
              }`}
            >
              {mode === "TUNAI" ? "Tunai" : mode === "KREDIT" ? "Kredit" : "Sebagian"}
            </button>
          ))}
        </div>
        {paymentMode === "PARTIAL" && (
          <div className="mt-3">
            <Label>Bayar sekarang</Label>
            <Input type="number" min="0" value={bayar} onChange={(e) => setBayar(e.target.value)} />
          </div>
        )}
        {bayarNum > 0 && (
          <div className="mt-3">
            <Label>Rekening</Label>
            <Select value={rekening} onChange={(e) => setRekening(e.target.value)}>
              {kasBank.map((k) => (
                <option key={k.id} value={k.name}>{k.name}</option>
              ))}
            </Select>
          </div>
        )}
        {kurangBayar > 0.01 && (
          <p className="mt-2 text-sm text-amber-700">Sisa hutang: {formatRp(kurangBayar)}</p>
        )}
      </div>

      <Button type="submit" disabled={saving || !suppliers.length || !categories.length}>
        {saving ? "Menyimpan..." : "Simpan pembelian"}
      </Button>
      {!categories.length && (
        <p className="text-xs text-amber-600">Tambah Kategori Pembelian di Master Data terlebih dahulu.</p>
      )}
    </form>
  );
}
