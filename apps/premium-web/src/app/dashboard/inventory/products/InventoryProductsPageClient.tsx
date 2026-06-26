"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MasterTabPanel } from "@/components/master/MasterTabPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatRp } from "@/lib/org/print-utils";
import type { MembershipRole } from "@/lib/org/roles";
import type { InventoryCatalogItem } from "@/lib/inventory/fetch-inventory-catalog";

type CatalogResponse = {
  outlets: {
    enabled: boolean;
    options: Array<{ outletCode: string; label: string; name: string }>;
    locked: boolean;
  };
  selectedOutlet: { outletCode: string; name: string } | null;
  warehouse: { id: string; code: string; name: string } | null;
  categories: Array<{ id: string; code: string; name: string; productKind: string }>;
  productKinds: Array<{ value: string; label: string }>;
  items: InventoryCatalogItem[];
  error?: string;
};

const PAGE_SIZES = [10, 25, 50, 100] as const;

const INVENTORY_TAB_PATH: Record<string, string> = {
  suppliers: "/dashboard/inventory/suppliers",
  "product-categories": "/dashboard/inventory/product-categories",
  outlets: "/dashboard/inventory/outlets"
};

export default function InventoryProductsPageClient({ role }: { role: MembershipRole }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryCatalogItem[]>([]);
  const [outletOptions, setOutletOptions] = useState<CatalogResponse["outlets"]["options"]>([]);
  const [outletLocked, setOutletLocked] = useState(false);
  const [categories, setCategories] = useState<CatalogResponse["categories"]>([]);
  const [productKinds, setProductKinds] = useState<CatalogResponse["productKinds"]>([]);
  const [warehouseName, setWarehouseName] = useState("");

  const [outletCode, setOutletCode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productKind, setProductKind] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const requestSeq = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadCatalog = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (outletCode) params.set("outlet_code", outletCode);
      if (categoryId) params.set("category_id", categoryId);
      if (productKind) params.set("product_kind", productKind);
      if (searchDebounced.trim()) params.set("search", searchDebounced.trim());

      const res = await fetch(`/api/inventory/products?${params.toString()}`);
      const data = (await res.json()) as CatalogResponse;
      if (!res.ok) throw new Error(data.error || "Gagal memuat");

      if (seq !== requestSeq.current) return;

      setItems(data.items || []);
      setOutletOptions(data.outlets?.options || []);
      setOutletLocked(Boolean(data.outlets?.locked));
      setCategories(data.categories || []);
      setProductKinds(data.productKinds || []);
      setWarehouseName(data.warehouse?.name || data.selectedOutlet?.name || "—");

      if (data.selectedOutlet?.outletCode && data.selectedOutlet.outletCode !== outletCode) {
        setOutletCode(data.selectedOutlet.outletCode);
      }
    } catch (e) {
      if (seq === requestSeq.current) {
        setError(e instanceof Error ? e.message : "Gagal memuat");
        setItems([]);
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  }, [outletCode, categoryId, productKind, searchDebounced]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setPage(1);
  }, [outletCode, categoryId, productKind, searchDebounced, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  function exportCsv() {
    const header = ["SKU", "Nama", "Stok", "Satuan", "Kategori", "Jenis", "Gudang", "Harga", "Catatan stok"];
    const rows = items.map((r) => [
      r.sku || "",
      r.name,
      r.stockQtyLabel,
      r.unitLabel,
      r.categoryName,
      r.kindLabel,
      r.warehouseName,
      String(r.sellPrice),
      r.stockNote || ""
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `produk-${outletCode || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canPickOutlet = outletOptions.length > 0 && !outletLocked;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        badge="Management Inventory"
        title="Produk"
        description="Katalog produk per outlet. Setiap produk terikat outlet (metadata); filter gudang hanya menampilkan produk outlet tersebut."
      >
        <Link href="/dashboard/master" className="text-sm text-slate-500 hover:text-slate-700">
          Master · Finance →
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(INVENTORY_TAB_PATH).map(([id, href]) => (
          <Link
            key={id}
            href={href}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {id === "suppliers"
              ? "Supplier"
              : id === "product-categories"
                ? "Kategori Produk"
                : "Outlet / Cabang"}
          </Link>
        ))}
      </div>

      <Card className="mb-6 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {outletOptions.length > 0 ? (
            <div>
              <Label>Outlet / Gudang</Label>
              <Select
                value={outletCode}
                disabled={outletLocked || loading}
                onChange={(e) => setOutletCode(e.target.value)}
              >
                {!outletLocked ? <option value="">— Pilih outlet —</option> : null}
                {outletOptions.map((o) => (
                  <option key={o.outletCode} value={o.outletCode}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {warehouseName ? (
                <p className="mt-1 text-xs text-slate-500">Gudang: {warehouseName}</p>
              ) : null}
            </div>
          ) : null}

          <div>
            <Label>Kategori produk</Label>
            <Select
              value={categoryId}
              disabled={loading}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Semua kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Jenis item</Label>
            <Select
              value={productKind}
              disabled={loading}
              onChange={(e) => setProductKind(e.target.value)}
            >
              <option value="">Semua jenis</option>
              {productKinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Cari</Label>
            <Input
              placeholder="Nama, SKU, kategori…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => void loadCatalog()} disabled={loading}>
            {loading ? "Memuat…" : "Refresh"}
          </Button>
          <Button type="button" variant="secondary" onClick={exportCsv} disabled={!items.length}>
            Excel / CSV
          </Button>
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Tutup form" : "Tambah / edit produk"}
          </Button>
          {canPickOutlet && !outletCode ? (
            <p className="text-xs text-amber-700">Pilih outlet untuk melihat stok per gudang.</p>
          ) : null}
        </div>
      </Card>

      {showForm ? (
        <Card className="mb-6 p-4">
          <MasterTabPanel tab="products" />
        </Card>
      ) : null}

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span>Tampilkan</span>
            <Select
              className="w-auto py-1 text-sm"
              value={String(pageSize)}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <span>entri</span>
          </div>
          <p>
            {items.length} produk
            {outletCode ? ` · ${outletCode}` : ""}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3">SKU / Kode</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Gudang</th>
                <th className="px-4 py-3">Satuan</th>
                <th className="px-4 py-3 text-right">Harga</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !pageItems.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Memuat produk…
                  </td>
                </tr>
              ) : !pageItems.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Tidak ada produk untuk filter ini.
                  </td>
                </tr>
              ) : (
                pageItems.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
                  >
                    <td className="px-4 py-3 text-slate-500">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-teal-700">{row.name}</p>
                      {row.stockNote ? (
                        <p className="mt-0.5 text-[11px] text-slate-400">{row.stockNote}</p>
                      ) : null}
                      {!row.active ? (
                        <span className="mt-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                          Nonaktif
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                      {row.stockQtyLabel}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.sku || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.categoryName}</td>
                    <td className="px-4 py-3 text-slate-600">{row.kindLabel}</td>
                    <td className="px-4 py-3 text-slate-600">{row.warehouseName}</td>
                    <td className="px-4 py-3 text-slate-600">{row.unitLabel}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">
                      {formatRp(row.sellPrice)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <span className="text-slate-600">
              Halaman {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya
            </Button>
          </div>
        ) : null}
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        Peran: {role}. Barang dagang & bahan baku menampilkan stok gudang outlet. Menu F&B tanpa stok sendiri
        menampilkan &quot;—&quot; (stok bahan lewat BOM saat BOM aktif). Jasa selalu tanpa stok.
      </p>
    </main>
  );
}
