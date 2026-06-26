"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
  active: boolean;
  outlets: Array<{ outlet_code: string; name: string; active: boolean }>;
};

export default function WarehousePageClient() {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: "",
    code: "",
    name: "",
    is_default: false,
    active: true
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/warehouses");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat gudang");
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
      const res = await fetch("/api/inventory/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          code: form.code,
          name: form.name,
          is_default: form.is_default,
          active: form.active
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setForm({ id: "", code: "", name: "", is_default: false, active: true });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: WarehouseRow) {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      is_default: row.is_default,
      active: row.active
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        badge="Management Inventory"
        title="Warehouse"
        description="Gudang fisik tempat stok disimpan. Setiap outlet dihubungkan ke satu gudang di menu Outlet / Cabang."
      >
        <Link
          href="/dashboard/inventory/outlets"
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Outlet / Cabang →
        </Link>
      </PageHeader>

      <Card className="mb-6 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          {form.id ? "Edit gudang" : "Tambah gudang"}
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Kode gudang</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="MART"
              required
            />
          </div>
          <div>
            <Label>Nama gudang</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Gudang Mart"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
              className="rounded border-slate-300 text-brand-600"
            />
            Gudang default (org tanpa multi-outlet)
          </label>
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
              {saving ? "Menyimpan…" : form.id ? "Update" : "Tambah gudang"}
            </Button>
            {form.id ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setForm({ id: "", code: "", name: "", is_default: false, active: true })}
              >
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
          <p className="p-6 text-sm text-slate-500">
            Belum ada gudang. Hybrid-lab seharusnya punya MART, CAFE, FASHION — refresh atau tambah
            manual di atas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Nama gudang</th>
                  <th className="px-4 py-3">Outlet terhubung</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehouses.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-800">{w.code}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {w.name}
                      {w.is_default ? (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          default
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {w.outlets.length ? (
                        <ul className="space-y-0.5">
                          {w.outlets.map((o) => (
                            <li key={o.outlet_code}>
                              <span className="font-medium">{o.outlet_code}</span> — {o.name}
                              {!o.active ? (
                                <span className="ml-1 text-xs text-slate-400">(nonaktif)</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">Belum ada outlet</span>
                      )}
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

      <p className="mt-4 text-xs text-slate-500">
        Menautkan outlet ke gudang: buka{" "}
        <Link href="/dashboard/inventory/outlets" className="font-medium text-brand-600 hover:text-brand-700">
          Management Inventory → Outlet / Cabang
        </Link>
        , pilih gudang stok saat tambah outlet.
      </p>
    </main>
  );
}
