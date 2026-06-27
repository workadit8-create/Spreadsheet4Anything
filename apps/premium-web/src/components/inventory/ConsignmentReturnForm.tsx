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
  consignmentLineCardReturnClass,
  consignmentSectionClass
} from "@/components/inventory/consignment-layout";
import { formatWarehouseOptionLabel } from "@/lib/inventory/warehouse-option-label";

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
  isDisplay: boolean;
  warehouseRole: string;
};

type Supplier = { id: string; name: string };
type Product = { id: string; sku: string | null; name: string };

type LineState = {
  key: string;
  product_id: string;
  qty: string;
};

function emptyLine(): LineState {
  return {
    key: `${Date.now()}-${Math.random()}`,
    product_id: "",
    qty: "1"
  };
}

export function ConsignmentReturnForm({ onCreated }: { onCreated?: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [outlets, setOutlets] = useState<Array<{ code: string; label: string }>>([]);
  const [outletLocked, setOutletLocked] = useState(false);
  const [multiWarehouse, setMultiWarehouse] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [returnDate, setReturnDate] = useState(() => wibTodayIso());
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
      setMultiWarehouse(Boolean(data.multiWarehouse));
      const whOpts: WarehouseOption[] = data.warehouses || [];
      setWarehouses(whOpts);
      setWarehouseId((prev) => {
        if (prev && whOpts.some((w) => w.id === prev)) return prev;
        return whOpts[0]?.id || "";
      });
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (!supplierId) throw new Error("Supplier wajib");
      if (multiWarehouse && warehouses.length && !warehouseId) {
        throw new Error("Pilih gudang sumber stok");
      }
      const payload = {
        supplier_id: supplierId,
        return_date: returnDate,
        outlet_code: outletCode || undefined,
        warehouse_id: multiWarehouse && warehouseId ? warehouseId : undefined,
        notes: notes.trim() || undefined,
        lines: lines
          .filter((l) => l.product_id && Number(l.qty) > 0)
          .map((l) => ({ product_id: l.product_id, qty: Number(l.qty) }))
      };
      if (!payload.lines.length) throw new Error("Minimal satu baris produk");

      const res = await fetch("/api/inventory/consignment/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");

      setMessage(`${data.returnNo} — stok titip dikembalikan ke supplier`);
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
        Barang titip yang belum terjual dikembalikan ke supplier — stok keluar, tanpa jurnal
        pembayaran.
      </p>

      <div className={consignmentFieldGridClass}>
        <div>
          <Label>Tanggal retur</Label>
          <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
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
              onChange={(e) => {
                setOutletCode(e.target.value);
                setWarehouseId("");
              }}
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
        {multiWarehouse && warehouses.length ? (
          <div>
            <Label>Gudang sumber stok</Label>
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              {warehouses.length > 1 ? <option value="">— Pilih —</option> : null}
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {formatWarehouseOptionLabel(w)}
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
          <h3 className="text-sm font-semibold text-slate-800">Barang dikembalikan</h3>
          <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, emptyLine()])}>
            + Baris
          </Button>
        </div>
        <div className="space-y-4">
        {lines.map((line) => (
          <div key={line.key} className={consignmentLineCardReturnClass}>
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
              <Label>Qty retur</Label>
              <Input
                type="number"
                min="0.0001"
                step="any"
                value={line.qty}
                onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                required
              />
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className={consignmentActionsClass}>
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan retur barang"}
        </Button>
      </div>
    </form>
  );
}
