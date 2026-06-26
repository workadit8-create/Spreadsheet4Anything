"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { OutletOption } from "@/lib/outlets/bootstrap-options";
import type { MembershipRole } from "@/lib/org/roles";

type StockRow = {
  id: string;
  sku: string | null;
  name: string;
  unitCode: string;
  stockQty: number;
};

type Bootstrap = {
  enabled: boolean;
  outlets?: { options: OutletOption[] };
  inventoryScope?: { restricted: boolean; locked: boolean };
  outlet?: { outletCode: string; name: string } | null;
  warehouse?: { id: string; code: string; name: string } | null;
  products: StockRow[];
};

type CountDraft = Record<string, string>;

export default function StokOutletPageClient({ role }: { role: MembershipRole }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [outletOptions, setOutletOptions] = useState<OutletOption[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState("");
  const [outletLocked, setOutletLocked] = useState(false);
  const [warehouseName, setWarehouseName] = useState("");
  const [products, setProducts] = useState<StockRow[]>([]);
  const [counts, setCounts] = useState<CountDraft>({});
  const [notes, setNotes] = useState("Opname harian");
  const requestSeq = useRef(0);

  const applyBootstrap = useCallback((data: Bootstrap) => {
    setOutletOptions(data.outlets?.options || []);
    setOutletLocked(Boolean(data.inventoryScope?.locked));

    if (data.outlet) {
      setSelectedOutlet(data.outlet.outletCode);
      setWarehouseName(data.warehouse?.name || "");
      setProducts(data.products || []);
      const draft: CountDraft = {};
      for (const p of data.products || []) {
        draft[p.id] = String(p.stockQty);
      }
      setCounts(draft);
    }
  }, []);

  const loadOutletStock = useCallback(
    async (outletCode: string, parentSeq?: number) => {
      const seq = parentSeq ?? ++requestSeq.current;
      if (parentSeq === undefined) {
        requestSeq.current = seq;
      }
      setLoading(true);
      setError(null);
      setSelectedOutlet(outletCode);
      try {
        const res = await fetch(
          `/api/inventory/outlet/bootstrap?outlet_code=${encodeURIComponent(outletCode)}`
        );
        const data = (await res.json()) as Bootstrap & { error?: string };
        if (!res.ok) throw new Error(data.error || "Gagal memuat");
        if (seq !== requestSeq.current) return;

        applyBootstrap(data);
      } catch (e) {
        if (seq === requestSeq.current) {
          setError(e instanceof Error ? e.message : "Gagal memuat");
          setSelectedOutlet("");
          setProducts([]);
          setCounts({});
        }
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [applyBootstrap]
  );

  const loadOutletList = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/outlet/bootstrap");
      const data = (await res.json()) as Bootstrap & { error?: string };
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      if (seq !== requestSeq.current) return;

      setOutletOptions(data.outlets?.options || []);
      setOutletLocked(Boolean(data.inventoryScope?.locked));

      if (data.inventoryScope?.locked && data.outlets?.options?.length === 1) {
        const only = data.outlets.options[0].outletCode;
        await loadOutletStock(only, seq);
        return;
      }
    } catch (e) {
      if (seq === requestSeq.current) {
        setError(e instanceof Error ? e.message : "Gagal memuat");
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  }, [loadOutletStock]);

  useEffect(() => {
    void loadOutletList();
  }, [loadOutletList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const changedCount = useMemo(() => {
    return products.filter((p) => {
      const physical = Number(counts[p.id]);
      if (!Number.isFinite(physical)) return false;
      return Math.abs(physical - p.stockQty) > 0.0001;
    }).length;
  }, [products, counts]);

  async function onSave() {
    if (!selectedOutlet) {
      setError("Pilih outlet dulu");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const lines = products
        .map((p) => ({
          product_id: p.id,
          qty_after: Number(counts[p.id])
        }))
        .filter((l) => Number.isFinite(l.qty_after));

      const res = await fetch("/api/inventory/outlet/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_code: selectedOutlet,
          notes,
          lines
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      setMessage(data.message || "Opname tersimpan");
      await loadOutletStock(selectedOutlet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  function backToPicker() {
    requestSeq.current += 1;
    setSelectedOutlet("");
    setProducts([]);
    setCounts({});
    setWarehouseName("");
    setError(null);
    setMessage(null);
  }

  if (loading && !outletOptions.length && !selectedOutlet) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8 text-sm text-slate-500">
        Memuat stok outlet…
      </main>
    );
  }

  if (!outletOptions.length) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <PageHeader title="Stock Opname" description="Opname & penyesuaian stok per gudang outlet" />
        <Card className="p-6 text-sm text-slate-600">
          Belum ada outlet aktif. Buat di Master → Outlet / Cabang.
        </Card>
      </main>
    );
  }

  if (!selectedOutlet) {
    return (
      <main className="mx-auto max-w-lg px-6 py-12">
        <PageHeader
          title="Stock Opname"
          description="Pilih outlet untuk opname / penyesuaian stok gudang."
        />
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="mt-6 grid gap-2">
          {outletOptions.map((o) => (
            <button
              key={o.outletCode}
              type="button"
              disabled={loading}
              onClick={() => void loadOutletStock(o.outletCode)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-brand-400 disabled:opacity-50"
            >
              <div className="font-semibold text-slate-900">{o.name}</div>
              <div className="text-xs text-slate-500">{o.outletCode}</div>
            </button>
          ))}
        </div>
        <Link href="/dashboard" className="mt-6 inline-block text-sm text-brand-600">
          ← Dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge={selectedOutlet}
        title="Stock Opname"
        description={
          warehouseName
            ? `Opname gudang ${warehouseName} — isi qty fisik, sistem hitung selisih otomatis.`
            : "Opname stok per outlet"
        }
      >
        <div className="flex gap-3 text-sm">
          {!outletLocked && outletOptions.length > 1 ? (
            <button type="button" className="text-brand-600 hover:underline" onClick={backToPicker}>
              Ganti outlet
            </button>
          ) : null}
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-700">
            ← Dashboard
          </Link>
        </div>
      </PageHeader>

      {loading ? (
        <p className="mb-4 text-sm text-slate-500">Memuat produk…</p>
      ) : null}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <Card className="mb-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Keterangan opname</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>Cari produk</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nama atau SKU…"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Peran: <strong>{role}</strong> · {changedCount} baris berubah dari saldo sistem
        </p>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3 text-right">Saldo sistem</th>
                <th className="px-4 py-3 text-right">Qty fisik</th>
                <th className="px-4 py-3 text-right">Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => {
                const physical = Number(counts[p.id]);
                const valid = Number.isFinite(physical);
                const delta = valid ? physical - p.stockQty : 0;
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      {p.sku ? <div className="text-xs text-slate-500">{p.sku}</div> : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {p.stockQty} {p.unitCode}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Input
                        className="ml-auto max-w-[120px] text-right tabular-nums"
                        inputMode="decimal"
                        value={counts[p.id] ?? ""}
                        onChange={(e) =>
                          setCounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums font-medium ${
                        valid && delta < 0
                          ? "text-red-600"
                          : valid && delta > 0
                            ? "text-emerald-600"
                            : "text-slate-400"
                      }`}
                    >
                      {valid ? (delta > 0 ? `+${delta}` : delta) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && !filtered.length ? (
          <p className="px-4 py-8 text-sm text-slate-500">
            Tidak ada produk ber-stok di master. Aktifkan pelacakan stok di kategori/produk.
          </p>
        ) : null}
      </Card>

      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={() => void onSave()} disabled={saving || loading}>
          {saving ? "Menyimpan…" : "Simpan opname"}
        </Button>
      </div>
    </main>
  );
}
