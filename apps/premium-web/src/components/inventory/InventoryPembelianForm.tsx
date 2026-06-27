"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { computePurchaseLineTotal } from "@/lib/posting/purchase-lines";
import { computeLineTax, summarizeLineTax } from "@/lib/tax/compute";
import { wibTodayIso } from "@/lib/date/wib";

type Supplier = { id: string; name: string; pkp?: boolean };
type Product = { id: string; sku: string | null; name: string; sellPrice: number };
type KasBank = { id: string; name: string };

type LineState = {
  key: string;
  product_id: string;
  qty: string;
  unit_cost: string;
  diskon: string;
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
    product_id: "",
    qty: "1",
    unit_cost: "",
    diskon: "0"
  };
}

export function InventoryPembelianForm({ onCreated }: { onCreated?: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [kasBank, setKasBank] = useState<KasBank[]>([]);
  const [outlets, setOutlets] = useState<Array<{ code: string; label: string }>>([]);
  const [outletLocked, setOutletLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [orderDate, setOrderDate] = useState(() => wibTodayIso());
  const [supplierId, setSupplierId] = useState("");
  const [outletCode, setOutletCode] = useState("");
  const [rekening, setRekening] = useState("");
  const [paymentMode, setPaymentMode] = useState<"TUNAI" | "KREDIT" | "PARTIAL">("TUNAI");
  const [bayar, setBayar] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [purchasePpnAvailable, setPurchasePpnAvailable] = useState(false);
  const [purchasePpnSettings, setPurchasePpnSettings] = useState<{
    ratePercent: number;
    priceIncludesTax: boolean;
  } | null>(null);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const supplierPkp = selectedSupplier?.pkp === true;
  const purchaseTaxActive = purchasePpnAvailable && supplierPkp;

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (outletCode) params.set("outlet_code", outletCode);
      const res = await fetch(`/api/inventory/purchase-orders/bootstrap?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setSuppliers(data.suppliers || []);
      setProducts(data.products || []);
      setKasBank(data.kasBank || []);
      setOutlets(data.outlets || []);
      setOutletLocked(Boolean(data.outletLocked));
      if (data.outlets?.length === 1 && !outletCode) {
        setOutletCode(data.outlets[0].code);
      }
      setPurchasePpnAvailable(data.purchasePpn?.available === true);
      if (data.purchasePpn?.available) {
        setPurchasePpnSettings({
          ratePercent: data.purchasePpn.ratePercent,
          priceIncludesTax: data.purchasePpn.priceIncludesTax
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [outletCode]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const lineTaxResults = lines.map((line) => {
    const qty = Number(line.qty) || 0;
    const cost = Number(line.unit_cost) || 0;
    const diskon = Number(line.diskon) || 0;
    const netBeforeTax = computePurchaseLineTotal(qty, cost, diskon);
    return computeLineTax(
      netBeforeTax,
      purchaseTaxActive,
      purchasePpnSettings?.ratePercent ?? 0,
      purchasePpnSettings?.priceIncludesTax ?? false,
      purchaseTaxActive ? "ppn" : null
    );
  });

  const taxSummary = summarizeLineTax(lineTaxResults);
  const grandTotal = taxSummary.grandTotal;
  const bayarNum =
    paymentMode === "TUNAI"
      ? grandTotal
      : paymentMode === "KREDIT"
        ? 0
        : Math.min(grandTotal, Math.max(0, Number(bayar) || 0));

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (!supplierId) throw new Error("Pilih supplier");
      if (outlets.length && !outletCode) throw new Error("Pilih outlet");
      const payloadLines = lines
        .filter((l) => l.product_id)
        .map((l) => ({
          product_id: l.product_id,
          qty: Number(l.qty) || 1,
          unit_cost: Number(l.unit_cost) || 0,
          diskon: Number(l.diskon) || 0
        }));
      if (!payloadLines.length) throw new Error("Minimal satu produk");
      if (payloadLines.some((l) => l.unit_cost <= 0)) {
        throw new Error("Harga beli harus > 0");
      }

      const res = await fetch("/api/inventory/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId,
          order_date: orderDate,
          outlet_code: outletCode || undefined,
          bayar: bayarNum,
          rekening: bayarNum > 0 ? rekening : "",
          lines: payloadLines
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");

      setMessage(data.message || "PO disimpan");
      setLines([emptyLine()]);
      setBayar("");
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !suppliers.length) {
    return <p className="text-sm text-slate-500">Memuat…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Tanggal</Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
        </div>
        <div>
          <Label>Supplier</Label>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">— Pilih —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {outlets.length ? (
          <div>
            <Label>Outlet / Gudang</Label>
            <Select
              value={outletCode}
              disabled={outletLocked}
              onChange={(e) => setOutletCode(e.target.value)}
              required
            >
              {!outletLocked ? <option value="">— Pilih —</option> : null}
              {outlets.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Baris produk</h3>
          <Button type="button" variant="secondary" onClick={addLine}>
            + Baris
          </Button>
        </div>
        {lines.map((line) => (
          <div key={line.key} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Label>Produk</Label>
              <Select
                value={line.product_id}
                onChange={(e) => updateLine(line.key, { product_id: e.target.value })}
              >
                <option value="">— Pilih —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku ? `${p.sku} — ` : ""}
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Qty</Label>
              <Input
                type="number"
                min={0.0001}
                step="any"
                value={line.qty}
                onChange={(e) => updateLine(line.key, { qty: e.target.value })}
              />
            </div>
            <div>
              <Label>Harga beli</Label>
              <Input
                type="number"
                min={0}
                value={line.unit_cost}
                onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
              />
            </div>
            <div>
              <Label>Diskon</Label>
              <Input
                type="number"
                min={0}
                value={line.diskon}
                onChange={(e) => updateLine(line.key, { diskon: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="ghost" onClick={() => removeLine(line.key)}>
                Hapus
              </Button>
            </div>
          </div>
        ))}
        {!products.length && outletCode ? (
          <p className="text-xs text-amber-700">Tidak ada produk track-stok untuk outlet ini.</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Pembayaran</Label>
          <Select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as "TUNAI" | "KREDIT" | "PARTIAL")}
          >
            <option value="TUNAI">Tunai (lunas)</option>
            <option value="KREDIT">Kredit</option>
            <option value="PARTIAL">Bayar sebagian</option>
          </Select>
        </div>
        {paymentMode === "PARTIAL" ? (
          <div>
            <Label>Bayar</Label>
            <Input type="number" min={0} value={bayar} onChange={(e) => setBayar(e.target.value)} />
          </div>
        ) : null}
        {bayarNum > 0 ? (
          <div>
            <Label>Rekening</Label>
            <Select value={rekening} onChange={(e) => setRekening(e.target.value)} required>
              <option value="">— Pilih —</option>
              {kasBank.map((k) => (
                <option key={k.id} value={k.name}>
                  {k.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
        <p>
          Total PO: <strong>{formatRp(grandTotal)}</strong>
          {purchaseTaxActive ? ` (termasuk PPN ${formatRp(taxSummary.taxTotal)})` : null}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Posting → jurnal Dr Persediaan / Cr Utang-Kas + stok masuk + update HPP produk.
        </p>
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? "Menyimpan…" : "Simpan PO"}
      </Button>
    </form>
  );
}
