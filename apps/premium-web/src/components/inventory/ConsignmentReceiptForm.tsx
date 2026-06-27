"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { wibTodayIso } from "@/lib/date/wib";
import {
  consignmentActionsClass,
  consignmentFieldGridClass,
  consignmentFormClass,
  consignmentHintClass,
  consignmentLineCardClass,
  consignmentSectionClass
} from "@/components/inventory/consignment-layout";

type Supplier = { id: string; name: string };
type Product = {
  id: string;
  sku: string | null;
  name: string;
  settlementPrice: number;
};

type LineState = {
  key: string;
  product_id: string;
  qty: string;
  unit_settlement: string;
};

function emptyLine(): LineState {
  return {
    key: `${Date.now()}-${Math.random()}`,
    product_id: "",
    qty: "1",
    unit_settlement: ""
  };
}

export function ConsignmentReceiptForm({ onCreated }: { onCreated?: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [outlets, setOutlets] = useState<Array<{ code: string; label: string }>>([]);
  const [outletLocked, setOutletLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [receiptDate, setReceiptDate] = useState(() => wibTodayIso());
  const [supplierId, setSupplierId] = useState("");
  const [outletCode, setOutletCode] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (outletCode) params.set("outlet_code", outletCode);
      if (supplierId) params.set("supplier_id", supplierId);
      const res = await fetch(`/api/inventory/consignment/bootstrap?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setSuppliers(data.suppliers || []);
      setProducts(data.products || []);
      setOutlets(data.outlets || []);
      setOutletLocked(Boolean(data.outletLocked));
      if (data.outlets?.length === 1 && !outletCode) {
        setOutletCode(data.outlets[0].code);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [outletCode, supplierId]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function onProductPick(lineKey: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateLine(lineKey, {
      product_id: productId,
      unit_settlement: product ? String(product.settlementPrice) : ""
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (!supplierId) throw new Error("Supplier wajib");
      const payload = {
        supplier_id: supplierId,
        receipt_date: receiptDate,
        outlet_code: outletCode || undefined,
        notes: notes.trim() || undefined,
        lines: lines
          .filter((l) => l.product_id && Number(l.qty) > 0)
          .map((l) => ({
            product_id: l.product_id,
            qty: Number(l.qty),
            unit_settlement: l.unit_settlement ? Number(l.unit_settlement) : undefined
          }))
      };
      if (!payload.lines.length) throw new Error("Minimal satu baris produk");

      const res = await fetch("/api/inventory/consignment/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");

      setMessage(`${data.receiptNo} — stok titip masuk`);
      setLines([emptyLine()]);
      setNotes("");
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-8 text-sm text-slate-500">Memuat…</p>;

  return (
    <form onSubmit={onSubmit} className={consignmentFormClass}>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <p className={consignmentHintClass}>
        Barang titip masuk stok tanpa jurnal PO. Pemilik titip = supplier (orang tua cukup daftar
        sebagai supplier).
      </p>

      <div className={consignmentFieldGridClass}>
        <div>
          <Label>Tanggal</Label>
          <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
        </div>
        <div>
          <Label>Supplier pemilik titip</Label>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">— pilih —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {outlets.length ? (
          <div>
            <Label>Outlet</Label>
            <Select
              value={outletCode}
              onChange={(e) => setOutletCode(e.target.value)}
              disabled={outletLocked}
            >
              <option value="">— default —</option>
              {outlets.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Label>Catatan</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />
        </div>
      </div>

      <div className={consignmentSectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Barang titip</h3>
          <Button type="button" variant="secondary" onClick={addLine}>
            + Baris
          </Button>
        </div>
        {!supplierId ? (
          <p className="text-sm text-amber-700">Pilih supplier dulu untuk memuat produk titip.</p>
        ) : null}
        {!supplierId || products.length ? null : (
          <p className="text-sm text-amber-700">
            Belum ada produk titip untuk supplier ini — buat di Master Produk (kepemilikan = titip
            jual).
          </p>
        )}

        <div className="space-y-4">
        {lines.map((line) => (
          <div key={line.key} className={consignmentLineCardClass}>
            <div className="sm:col-span-2">
              <Label>Produk</Label>
              <Select
                value={line.product_id}
                onChange={(e) => onProductPick(line.key, e.target.value)}
                required
              >
                <option value="">— pilih —</option>
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
                min="0.0001"
                step="any"
                value={line.qty}
                onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Settlement/unit</Label>
              <Input
                type="number"
                min="0"
                value={line.unit_settlement}
                onChange={(e) => updateLine(line.key, { unit_settlement: e.target.value })}
              />
            </div>
            <div className="sm:col-span-4 flex justify-end pt-1">
              <Button type="button" variant="ghost" onClick={() => removeLine(line.key)}>
                Hapus baris
              </Button>
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className={consignmentActionsClass}>
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan penerimaan titip"}
        </Button>
      </div>
    </form>
  );
}
