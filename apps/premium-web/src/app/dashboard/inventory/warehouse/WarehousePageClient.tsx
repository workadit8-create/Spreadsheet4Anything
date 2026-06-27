"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

type WarehouseRole = "distribution" | "outlet";

type OutletOption = {
  id: string;
  outlet_code: string;
  name: string;
  active: boolean;
};

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
  active: boolean;
  is_display: boolean;
  warehouse_role: WarehouseRole;
  outlets: Array<{ outlet_code: string; name: string; active: boolean; is_primary: boolean }>;
};

type Flags = {
  multiWarehouse: boolean;
  multiOutlet: boolean;
  canAddWarehouse: boolean;
};

const emptyForm = {
  id: "",
  code: "",
  name: "",
  is_default: false,
  active: true,
  is_display: false,
  warehouse_role: "outlet" as WarehouseRole,
  outlet_id: "",
  is_primary: true
};

export default function WarehousePageClient() {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [flags, setFlags] = useState<Flags>({
    multiWarehouse: false,
    multiOutlet: false,
    canAddWarehouse: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/warehouses");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat gudang");
      setWarehouses(data.warehouses || []);
      setOutlets(data.outlets || []);
      setFlags(data.flags || { multiWarehouse: false, multiOutlet: false, canAddWarehouse: false });
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
      const res = await fetch("/api/inventory/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          code: form.code,
          name: form.name,
          is_default: form.is_default,
          active: form.active,
          is_display: form.is_display,
          warehouse_role: form.warehouse_role,
          outlet_id: form.outlet_id || null,
          is_primary: form.is_primary
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: WarehouseRow) {
    const linked = row.outlets[0];
    const outletMatch = outlets.find((o) => o.outlet_code === linked?.outlet_code);
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      is_default: row.is_default,
      active: row.active,
      is_display: row.is_display,
      warehouse_role: row.warehouse_role,
      outlet_id: outletMatch?.id || "",
      is_primary: linked?.is_primary ?? true
    });
  }

  const showMultiFields = flags.multiWarehouse;
  const canShowDefaultCheckbox = !flags.multiOutlet;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        badge="Management Inventory"
        title="Warehouse"
        description={
          flags.multiWarehouse
            ? "Kelola gudang distribusi, backroom, dan display. Transfer stok hanya antar gudang dalam outlet yang sama."
            : "Gudang fisik tempat stok disimpan. Aktifkan add-on Multi Warehouse untuk beberapa gudang per outlet."
        }
      >
        {flags.multiOutlet ? (
          <Link
            href="/dashboard/inventory/outlets"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Outlet / Cabang →
          </Link>
        ) : null}
      </PageHeader>

      {flags.multiWarehouse ? (
        <p className="mb-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          Multi Warehouse aktif — tandai minimal satu gudang per outlet sebagai{" "}
          <strong>Display</strong> agar stoknya bisa dijual di POS.
        </p>
      ) : (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Tanpa add-on Multi Warehouse: satu gudang default (bisa di-rename). Hubungi admin platform
          untuk mengaktifkan multi gudang.
        </p>
      )}

      <Card className="mb-6 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          {form.id ? "Edit gudang" : flags.canAddWarehouse ? "Tambah gudang" : "Edit gudang default"}
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Kode gudang</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="DC01"
              required
              disabled={Boolean(form.id)}
            />
          </div>
          <div>
            <Label>Nama gudang</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Gudang Display"
              required
            />
          </div>

          {showMultiFields ? (
            <>
              <div>
                <Label>Peran gudang</Label>
                <Select
                  value={form.warehouse_role}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      warehouse_role: e.target.value as WarehouseRole,
                      is_display: e.target.value === "distribution" ? false : f.is_display,
                      outlet_id: e.target.value === "distribution" ? "" : f.outlet_id
                    }))
                  }
                >
                  <option value="outlet">Gudang outlet (cabang/toko)</option>
                  <option value="distribution">Pusat distribusi (terima PO)</option>
                </Select>
              </div>
              {form.warehouse_role === "outlet" && flags.multiOutlet ? (
                <div>
                  <Label>Outlet terhubung</Label>
                  <Select
                    value={form.outlet_id}
                    onChange={(e) => setForm((f) => ({ ...f, outlet_id: e.target.value }))}
                  >
                    <option value="">— pilih outlet —</option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.outlet_code} — {o.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_display}
                  disabled={form.warehouse_role === "distribution"}
                  onChange={(e) => setForm((f) => ({ ...f, is_display: e.target.checked }))}
                  className="rounded border-slate-300 text-brand-600"
                />
                Display — stok gudang ini boleh dipakai penjualan (POS)
              </label>
            </>
          ) : null}

          {canShowDefaultCheckbox ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                className="rounded border-slate-300 text-brand-600"
              />
              Gudang default
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="rounded border-slate-300 text-brand-600"
            />
            Aktif
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : form.id ? "Update" : "Simpan"}
            </Button>
            {form.id ? (
              <Button type="button" variant="secondary" onClick={() => setForm(emptyForm)}>
                Batal
              </Button>
            ) : null}
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Memuat gudang…</p>
        ) : !warehouses.length ? (
          <p className="p-6 text-sm text-slate-500">Belum ada gudang.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Peran</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Tag</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehouses.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-800">{w.code}</td>
                    <td className="px-4 py-3 text-slate-800">{w.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {w.warehouse_role === "distribution" ? "Distribusi" : "Outlet"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {w.outlets.length ? (
                        <ul className="space-y-0.5">
                          {w.outlets.map((o) => (
                            <li key={o.outlet_code}>
                              <span className="font-medium">{o.outlet_code}</span> — {o.name}
                              {o.is_primary ? (
                                <span className="ml-1 text-xs text-slate-400">(utama)</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {w.is_default ? (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            default
                          </span>
                        ) : null}
                        {w.is_display ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                            display
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{w.active ? "Aktif" : "Nonaktif"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => startEdit(w)}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {flags.multiOutlet ? (
        <p className="mt-4 text-xs text-slate-500">
          Satu gudang hanya untuk satu outlet. Antar outlet gunakan pembelian, bukan transfer stok.
        </p>
      ) : null}
    </main>
  );
}
