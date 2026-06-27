"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
type KasBank = { id: string; name: string };
type PurchaseOrder = { id: string; poNo: string; orderDate: string; total: number };
type PoLine = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  returnableQty: number;
  unitCost: number;
};
type Product = { id: string; sku: string | null; name: string };

type LineState = {
  key: string;
  purchase_line_id: string;
  product_id: string;
  qty: string;
  unit_cost: string;
  maxQty: number;
  label: string;
};

function emptyManualLine(): LineState {
  return {
    key: `${Date.now()}-${Math.random()}`,
    purchase_line_id: "",
    product_id: "",
    qty: "1",
    unit_cost: "",
    maxQty: 0,
    label: ""
  };
}

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

export function PurchaseReturnForm({ onCreated }: { onCreated?: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [kasBank, setKasBank] = useState<KasBank[]>([]);
  const [outlets, setOutlets] = useState<Array<{ code: string; label: string }>>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [poLines, setPoLines] = useState<PoLine[]>([]);
  const [outletLocked, setOutletLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [returnDate, setReturnDate] = useState(() => wibTodayIso());
  const [supplierId, setSupplierId] = useState("");
  const [outletCode, setOutletCode] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [refundMode, setRefundMode] = useState<"KREDIT" | "TUNAI">("KREDIT");
  const [rekening, setRekening] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceMode, setSourceMode] = useState<"po" | "manual">("po");
  const [lines, setLines] = useState<LineState[]>([]);

  useEffect(() => {
    setPurchaseOrderId("");
  }, [supplierId]);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (outletCode) params.set("outlet_code", outletCode);
      if (supplierId) params.set("supplier_id", supplierId);
      if (purchaseOrderId) params.set("purchase_order_id", purchaseOrderId);
      const res = await fetch(`/api/inventory/purchase-returns/bootstrap?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");

      setSuppliers(data.suppliers || []);
      setProducts(data.products || []);
      setKasBank(data.kasBank || []);
      setOutlets(data.outlets || []);
      setOutletLocked(Boolean(data.outletLocked));
      setPurchaseOrders(data.purchaseOrders || []);
      setPoLines(data.poLines || []);

      if (data.outlets?.length === 1 && !outletCode) {
        setOutletCode(data.outlets[0].code);
      }
      if (data.kasBank?.length === 1 && !rekening) {
        setRekening(data.kasBank[0].name);
      }
      if (data.purchaseOrders?.length && !purchaseOrderId && sourceMode === "po") {
        setPurchaseOrderId(data.purchaseOrders[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [outletCode, supplierId, purchaseOrderId, rekening, sourceMode]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (sourceMode !== "po") return;
    setLines(
      poLines.map((pl) => ({
        key: pl.id,
        purchase_line_id: pl.id,
        product_id: pl.productId,
        qty: "",
        unit_cost: String(pl.unitCost),
        maxQty: pl.returnableQty,
        label: `${pl.sku ? `${pl.sku} — ` : ""}${pl.productName} (sisa ${pl.returnableQty})`
      }))
    );
  }, [poLines, sourceMode]);

  useEffect(() => {
    if (sourceMode === "manual" && !lines.length) {
      setLines([emptyManualLine()]);
    }
  }, [sourceMode, lines.length]);

  const selectedLines = useMemo(
    () =>
      lines.filter((l) => l.product_id && Number(l.qty) > 0),
    [lines]
  );

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (!supplierId) throw new Error("Supplier wajib");
      if (refundMode === "TUNAI" && !rekening) throw new Error("Rekening wajib untuk refund tunai");

      const payload = {
        supplier_id: supplierId,
        return_date: returnDate,
        outlet_code: outletCode || undefined,
        purchase_order_id: sourceMode === "po" ? purchaseOrderId || undefined : undefined,
        refund_mode: refundMode,
        rekening: refundMode === "TUNAI" ? rekening : undefined,
        notes: notes.trim() || undefined,
        lines: selectedLines.map((l) => ({
          product_id: l.product_id,
          qty: Number(l.qty),
          purchase_line_id: l.purchase_line_id || undefined,
          unit_cost: l.unit_cost ? Number(l.unit_cost) : undefined
        }))
      };
      if (!payload.lines.length) throw new Error("Minimal satu baris dengan qty > 0");

      const res = await fetch("/api/inventory/purchase-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");

      setMessage(data.message || `${data.returnNo} — retur berhasil`);
      setNotes("");
      if (sourceMode === "manual") setLines([emptyManualLine()]);
      else setLines((prev) => prev.map((l) => ({ ...l, qty: "" })));
      onCreated?.();
      await loadBootstrap();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !suppliers.length) {
    return <p className="py-8 text-sm text-slate-500">Memuat…</p>;
  }

  return (
    <form onSubmit={onSubmit} className={consignmentFormClass}>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <p className={consignmentHintClass}>
        Kembalikan barang ke supplier — stok keluar, HPP disesuaikan, jurnal Dr Utang/Kas · Cr
        Persediaan (+ PPN jika ada).
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSourceMode("po")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            sourceMode === "po"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Dari PO (disarankan)
        </button>
        <button
          type="button"
          onClick={() => setSourceMode("manual")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            sourceMode === "manual"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Manual (tanpa PO)
        </button>
      </div>

      <div className={consignmentFieldGridClass}>
        <div>
          <Label>Tanggal retur</Label>
          <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        </div>
        <div>
          <Label>Supplier</Label>
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
        {sourceMode === "po" ? (
          <div>
            <Label>PO sumber</Label>
            <Select
              value={purchaseOrderId}
              onChange={(e) => setPurchaseOrderId(e.target.value)}
              disabled={!supplierId}
            >
              <option value="">— pilih PO POSTED —</option>
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNo} · {po.orderDate} · {formatRp(po.total)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div>
          <Label>Refund ke</Label>
          <Select
            value={refundMode}
            onChange={(e) => setRefundMode(e.target.value as "KREDIT" | "TUNAI")}
          >
            <option value="KREDIT">Kurangi utang (KREDIT)</option>
            <option value="TUNAI">Kas masuk (TUNAI)</option>
          </Select>
        </div>
        {refundMode === "TUNAI" ? (
          <div>
            <Label>Rekening</Label>
            <Select value={rekening} onChange={(e) => setRekening(e.target.value)} required>
              <option value="">— pilih —</option>
              {kasBank.map((k) => (
                <option key={k.id} value={k.name}>
                  {k.name}
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
        <h3 className="text-sm font-semibold text-slate-800">Barang dikembalikan</h3>

        {sourceMode === "po" && !supplierId ? (
          <p className="text-sm text-amber-700">Pilih supplier dulu.</p>
        ) : null}
        {sourceMode === "po" && supplierId && !purchaseOrders.length ? (
          <p className="text-sm text-amber-700">Belum ada PO POSTED inventory untuk supplier ini.</p>
        ) : null}
        {sourceMode === "po" && purchaseOrderId && !poLines.length ? (
          <p className="text-sm text-amber-700">Semua baris PO sudah diretur penuh.</p>
        ) : null}

        <div className="space-y-4">
          {sourceMode === "po"
            ? lines.map((line) => (
                <div key={line.key} className={consignmentLineCardClass}>
                  <div className="sm:col-span-3">
                    <Label>Produk (dari PO)</Label>
                    <p className="text-sm text-slate-800">{line.label}</p>
                  </div>
                  <div>
                    <Label>Qty retur</Label>
                    <Input
                      type="number"
                      min="0"
                      max={line.maxQty || undefined}
                      step="any"
                      value={line.qty}
                      onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      placeholder={`max ${line.maxQty}`}
                    />
                  </div>
                </div>
              ))
            : lines.map((line) => (
                <div key={line.key} className={consignmentLineCardClass}>
                  <div className="sm:col-span-2">
                    <Label>Produk</Label>
                    <Select
                      value={line.product_id}
                      onChange={(e) => updateLine(line.key, { product_id: e.target.value })}
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
                    <Label>Harga beli/unit</Label>
                    <Input
                      type="number"
                      min="0"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
                      required
                    />
                  </div>
                  <div className="sm:col-span-4 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length <= 1 ? prev : prev.filter((l) => l.key !== line.key)
                        )
                      }
                    >
                      Hapus baris
                    </Button>
                  </div>
                </div>
              ))}
        </div>

        {sourceMode === "manual" ? (
          <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, emptyManualLine()])}>
            + Baris
          </Button>
        ) : null}
      </div>

      <div className={consignmentActionsClass}>
        <Button type="submit" disabled={saving || !selectedLines.length}>
          {saving ? "Menyimpan…" : "Simpan retur pembelian"}
        </Button>
      </div>
    </form>
  );
}
