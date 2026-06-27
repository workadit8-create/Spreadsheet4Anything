"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { wibTodayIso } from "@/lib/date/wib";
import {
  ConsignmentFormCard,
  consignmentActionsClass,
  consignmentFieldGridClass,
  consignmentFormClass,
  consignmentHintClass,
  consignmentLineCardClass,
  consignmentSectionClass
} from "@/components/inventory/consignment-layout";

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
  warehouseRole: string;
  isDisplay: boolean;
  outletCodes: string[];
};

type ProductOption = {
  id: string;
  sku: string | null;
  name: string;
  stockQty: number;
};

type LineState = {
  key: string;
  product_id: string;
  qty: string;
  maxQty: number;
  label: string;
};

function emptyLine(): LineState {
  return {
    key: `${Date.now()}-${Math.random()}`,
    product_id: "",
    qty: "1",
    maxQty: 0,
    label: ""
  };
}

function warehouseLabel(w: WarehouseOption) {
  const tags = [];
  if (w.warehouseRole === "distribution") tags.push("distribusi");
  if (w.isDisplay) tags.push("display");
  if (w.outletCodes.length) tags.push(w.outletCodes.join(", "));
  const suffix = tags.length ? ` (${tags.join(" · ")})` : "";
  return `${w.code} — ${w.name}${suffix}`;
}

function allowedToWarehouses(fromId: string, warehouses: WarehouseOption[]) {
  const from = warehouses.find((w) => w.id === fromId);
  if (!from) return [];
  return warehouses.filter((to) => {
    if (to.id === fromId) return false;
    if (from.warehouseRole === "distribution") {
      return to.warehouseRole === "outlet" && to.outletCodes.length > 0;
    }
    if (to.warehouseRole === "distribution") {
      return from.warehouseRole === "outlet" && from.outletCodes.length > 0;
    }
    if (from.outletCodes.length && to.outletCodes.length) {
      return from.outletCodes.some((c) => to.outletCodes.includes(c));
    }
    return true;
  });
}

export function StockTransferForm({ onCreated }: { onCreated?: () => void }) {
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [transferDate, setTransferDate] = useState(() => wibTodayIso());
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const toOptions = useMemo(
    () => allowedToWarehouses(fromWarehouseId, warehouses),
    [fromWarehouseId, warehouses]
  );

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromWarehouseId) params.set("from_warehouse_id", fromWarehouseId);
      const res = await fetch(`/api/inventory/stock-transfers/bootstrap?${params}`);
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setWarehouses(data.warehouses || []);
      setProducts(data.products || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [fromWarehouseId]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (toWarehouseId && !toOptions.some((w) => w.id === toWarehouseId)) {
      setToWarehouseId("");
    }
  }, [toWarehouseId, toOptions]);

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        transfer_date: transferDate,
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        notes,
        lines: lines
          .filter((l) => l.product_id && Number(l.qty) > 0)
          .map((l) => ({ product_id: l.product_id, qty: Number(l.qty) }))
      };
      const res = await fetch("/api/inventory/stock-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setMessage(data.message || "Transfer tersimpan");
      setLines([emptyLine()]);
      setNotes("");
      onCreated?.();
      await loadBootstrap();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !warehouses.length) {
    return <p className="text-sm text-slate-500">Memuat…</p>;
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className={consignmentFormClass}>
      <div className={consignmentSectionClass}>
        <div className={consignmentFieldGridClass}>
          <div>
            <Label>Tanggal transfer</Label>
            <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} required />
          </div>
          <div>
            <Label>Gudang asal</Label>
            <Select
              value={fromWarehouseId}
              onChange={(e) => {
                setFromWarehouseId(e.target.value);
                setLines([emptyLine()]);
              }}
              required
            >
              <option value="">— pilih gudang asal —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {warehouseLabel(w)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Gudang tujuan</Label>
            <Select
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
              required
              disabled={!fromWarehouseId}
            >
              <option value="">— pilih gudang tujuan —</option>
              {toOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {warehouseLabel(w)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className={consignmentHintClass}>
          Transfer hanya antar gudang dalam outlet yang sama, atau dari pusat distribusi ke gudang outlet.
          Antar outlet gunakan pembelian.
        </p>
      </div>

      <div className={consignmentSectionClass}>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-800">Barang transfer</h3>
          <Button type="button" variant="secondary" onClick={addLine} disabled={!fromWarehouseId}>
            + Baris
          </Button>
        </div>

        {!fromWarehouseId ? (
          <p className={consignmentHintClass}>Pilih gudang asal dulu untuk melihat stok tersedia.</p>
        ) : !products.length ? (
          <p className={consignmentHintClass}>Tidak ada stok &gt; 0 di gudang asal.</p>
        ) : (
          <div className="space-y-3">
            {lines.map((line) => (
              <div key={line.key} className={consignmentLineCardClass}>
                <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                  <div>
                    <Label>Produk</Label>
                    <Select
                      value={line.product_id}
                      onChange={(e) => {
                        const p = products.find((x) => x.id === e.target.value);
                        updateLine(line.key, {
                          product_id: e.target.value,
                          maxQty: p?.stockQty ?? 0,
                          label: p ? `${p.sku ? `${p.sku} — ` : ""}${p.name}` : "",
                          qty: p ? String(Math.min(Number(line.qty) || 1, p.stockQty)) : "1"
                        });
                      }}
                    >
                      <option value="">— pilih —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku ? `${p.sku} — ` : ""}
                          {p.name} (stok {p.stockQty})
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
                      max={line.maxQty || undefined}
                      value={line.qty}
                      onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" onClick={() => removeLine(line.key)}>
                      Hapus
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={consignmentSectionClass}>
        <Label>Catatan (opsional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Restock display, dll." />
      </div>

      <div className={consignmentActionsClass}>
        <Button type="submit" disabled={saving || !fromWarehouseId || !toWarehouseId}>
          {saving ? "Menyimpan…" : "Simpan transfer"}
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </form>
  );
}
