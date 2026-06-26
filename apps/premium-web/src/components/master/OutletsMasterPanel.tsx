"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { BUSINESS_SECTOR_LABELS, BUSINESS_SECTORS } from "@/lib/products/inventory-policy";

type Warehouse = { id: string; code: string; name: string };
type OutletRow = {
  id: string;
  outlet_code: string;
  name: string;
  business_sector: string;
  warehouse_id: string | null;
  active: boolean;
  sort_order: number;
};

export function OutletsMasterPanel() {
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    outlet_code: "",
    name: "",
    business_sector: "retail",
    warehouse_id: "",
    sort_order: "0"
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/master/outlets");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat outlet");
      setOutlets(data.outlets || []);
      setWarehouses(data.warehouses || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/master/outlets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          warehouse_id: form.warehouse_id || null,
          sort_order: Number(form.sort_order) || 0
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setForm({
        outlet_code: "",
        name: "",
        business_sector: "retail",
        warehouse_id: "",
        sort_order: "0"
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Outlet / cabang toko</h2>
      <p className="mb-4 text-sm text-slate-600">
        Satu PT bisa punya banyak outlet (mart, cafe, fashion). Dipakai untuk tag POS, penjualan,
        expense, dan jurnal manual — laporan L/R per outlet.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mb-6 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Kode outlet</Label>
          <Input
            value={form.outlet_code}
            onChange={(e) => setForm((f) => ({ ...f, outlet_code: e.target.value.toUpperCase() }))}
            placeholder="MART"
            required
          />
        </div>
        <div>
          <Label>Nama</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label>Jenis usaha</Label>
          <Select
            value={form.business_sector}
            onChange={(e) => setForm((f) => ({ ...f, business_sector: e.target.value }))}
          >
            {BUSINESS_SECTORS.map((s) => (
              <option key={s} value={s}>
                {BUSINESS_SECTOR_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Gudang stok</Label>
          <Select
            value={form.warehouse_id}
            onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
          >
            <option value="">— pilih gudang —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan…" : "Tambah outlet"}
          </Button>
        </div>
      </form>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Memuat…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-2">Kode</th>
              <th className="py-2">Nama</th>
              <th className="py-2">Sektor</th>
              <th className="py-2">Gudang</th>
            </tr>
          </thead>
          <tbody>
            {outlets.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{o.outlet_code}</td>
                <td className="py-2">{o.name}</td>
                <td className="py-2">{BUSINESS_SECTOR_LABELS[o.business_sector as keyof typeof BUSINESS_SECTOR_LABELS] || o.business_sector}</td>
                <td className="py-2">
                  <Select
                    className="max-w-xs py-1 text-sm"
                    value={o.warehouse_id || ""}
                    onChange={async (e) => {
                      const warehouse_id = e.target.value || null;
                      try {
                        const res = await fetch("/api/master/outlets", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: o.id, warehouse_id })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        await load();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Gagal update gudang");
                      }
                    }}
                  >
                    <option value="">— pilih gudang —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
