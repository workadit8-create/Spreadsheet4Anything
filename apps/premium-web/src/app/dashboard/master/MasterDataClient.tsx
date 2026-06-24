"use client";

import { useState } from "react";
import { MasterCrudPanel } from "@/components/master/MasterCrudPanel";
import { BusinessProfilePanel } from "@/components/master/BusinessProfilePanel";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PRODUCT_KIND_LABELS } from "@/lib/products/inventory-policy";

const PRODUCT_KIND_OPTIONS = Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => ({
  value,
  label
}));

const COA_TYPE_OPTIONS = [
  { value: "Aset", label: "Aset" },
  { value: "Kewajiban", label: "Kewajiban" },
  { value: "Ekuitas", label: "Ekuitas" },
  { value: "Pendapatan", label: "Pendapatan" },
  { value: "Beban", label: "Beban" }
];

const TABS = [
  { id: "customers", label: "Customer" },
  { id: "product-categories", label: "Kategori Produk" },
  { id: "products", label: "Produk" },
  { id: "units", label: "Satuan" },
  { id: "coa", label: "COA" },
  { id: "kas-bank", label: "Kas & Bank" },
  { id: "suppliers", label: "Supplier" },
  { id: "purchase-categories", label: "Kategori Pembelian" }
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function MasterDataClient() {
  const [tab, setTab] = useState<TabId>("customers");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Fase 1 · Master Data"
        title="Master Data"
        description="Multi-usaha: retail, F&B, manufaktur, jasa. Kategori produk atur apakah item kelola stok."
      />

      <BusinessProfilePanel />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {tab === "customers" && (
          <MasterCrudPanel
            title="Customer"
            apiPath="/api/master/customers"
            fields={[
              { key: "code", label: "Kode", type: "text" },
              { key: "name", label: "Nama", type: "text", required: true },
              { key: "phone", label: "Telepon", type: "text" },
              { key: "email", label: "Email", type: "text" },
              { key: "alamat", label: "Alamat", type: "text", metaKey: "alamat" },
              { key: "active", label: "Aktif", type: "checkbox" }
            ]}
            columns={[
              { key: "code", label: "Kode" },
              { key: "name", label: "Nama" },
              { key: "phone", label: "Telepon" },
              { key: "email", label: "Email" },
              { key: "alamat", label: "Alamat", metaKey: "alamat" },
              { key: "active", label: "Status" }
            ]}
          />
        )}
        {tab === "product-categories" && (
          <MasterCrudPanel
            title="Kategori Produk"
            apiPath="/api/master/product-categories"
            fields={[
              { key: "code", label: "Kode", type: "text", placeholder: "GOODS" },
              { key: "name", label: "Nama kategori", type: "text", required: true },
              { key: "sort_order", label: "Urutan", type: "number" },
              {
                key: "product_kind",
                label: "Jenis item",
                type: "select",
                options: PRODUCT_KIND_OPTIONS
              },
              { key: "tracks_stock", label: "Kelola stok (ada persediaan)", type: "checkbox" },
              { key: "uses_recipe", label: "Pakai resep/BOM (FNB/manufaktur)", type: "checkbox" },
              { key: "active", label: "Aktif", type: "checkbox" }
            ]}
            columns={[
              { key: "code", label: "Kode" },
              { key: "name", label: "Nama" },
              { key: "product_kind", label: "Jenis", format: "product_kind" },
              { key: "tracks_stock", label: "Stok", format: "boolean" },
              { key: "uses_recipe", label: "Resep", format: "boolean" },
              { key: "active", label: "Status" }
            ]}
          />
        )}
        {tab === "products" && (
          <MasterCrudPanel
            title="Produk"
            apiPath="/api/master/products"
            fields={[
              { key: "sku", label: "Kode/SKU", type: "text" },
              { key: "name", label: "Nama", type: "text", required: true },
              { key: "sell_price", label: "Harga", type: "number", required: true },
              {
                key: "category_id",
                label: "Kategori",
                type: "select",
                optionsKey: "categories"
              },
              {
                key: "stock_policy",
                label: "Kebijakan stok",
                type: "select",
                options: [
                  { value: "inherit", label: "Ikuti kategori" },
                  { value: "track", label: "Selalu kelola stok" },
                  { value: "no_track", label: "Tanpa stok" }
                ]
              },
              { key: "unit_id", label: "Satuan", type: "select", optionsKey: "units" },
              {
                key: "akunPendapatan",
                label: "Akun pendapatan",
                type: "select",
                metaKey: "akunPendapatan",
                optionsKey: "coa_accounts",
                coaAccountTypes: ["Pendapatan"]
              },
              { key: "active", label: "Aktif", type: "checkbox" }
            ]}
            columns={[
              { key: "sku", label: "SKU" },
              { key: "name", label: "Nama" },
              { key: "category_name", label: "Kategori" },
              { key: "tracks_stock_label", label: "Stok" },
              { key: "sell_price", label: "Harga" },
              { key: "akunPendapatan", label: "Akun", metaKey: "akunPendapatan" },
              { key: "active", label: "Status" }
            ]}
          />
        )}
        {tab === "units" && (
          <MasterCrudPanel
            title="Satuan"
            apiPath="/api/master/units"
            defaultForm={{}}
            fields={[
              { key: "code", label: "Kode", type: "text", required: true, placeholder: "PCS" },
              { key: "name", label: "Nama", type: "text", required: true, placeholder: "Pieces" }
            ]}
            columns={[
              { key: "code", label: "Kode" },
              { key: "name", label: "Nama" }
            ]}
          />
        )}
        {tab === "coa" && (
          <MasterCrudPanel
            title="Chart of Accounts (COA)"
            apiPath="/api/master/coa"
            defaultForm={{ active: true, account_type: "Aset" }}
            fields={[
              { key: "code", label: "Kode akun", type: "text", required: true, placeholder: "1-10001" },
              { key: "name", label: "Nama akun", type: "text", required: true },
              {
                key: "account_type",
                label: "Tipe akun",
                type: "select",
                options: COA_TYPE_OPTIONS
              },
              { key: "active", label: "Aktif", type: "checkbox" }
            ]}
            columns={[
              { key: "code", label: "Kode" },
              { key: "name", label: "Nama" },
              { key: "account_type", label: "Tipe" },
              { key: "active", label: "Status" }
            ]}
          />
        )}
        {tab === "kas-bank" && (
          <MasterCrudPanel
            title="Kas & Bank"
            apiPath="/api/master/kas-bank"
            fields={[
              { key: "code", label: "Kode", type: "text" },
              { key: "name", label: "Nama rekening", type: "text", required: true },
              {
                key: "coa_account_name",
                label: "Akun COA",
                type: "select",
                optionsKey: "coa_accounts",
                coaAccountTypes: ["Aset"],
                required: true
              },
              { key: "active", label: "Aktif", type: "checkbox" }
            ]}
            columns={[
              { key: "code", label: "Kode" },
              { key: "name", label: "Rekening" },
              { key: "coa_account_name", label: "Akun COA" },
              { key: "active", label: "Status" }
            ]}
          />
        )}
        {tab === "suppliers" && (
          <MasterCrudPanel
            title="Supplier"
            apiPath="/api/master/suppliers"
            fields={[
              { key: "code", label: "Kode", type: "text" },
              { key: "name", label: "Nama", type: "text", required: true },
              { key: "phone", label: "Telepon", type: "text" },
              { key: "email", label: "Email", type: "text" },
              { key: "active", label: "Aktif", type: "checkbox" }
            ]}
            columns={[
              { key: "code", label: "Kode" },
              { key: "name", label: "Nama" },
              { key: "phone", label: "Telepon" },
              { key: "email", label: "Email" },
              { key: "active", label: "Status" }
            ]}
          />
        )}
        {tab === "purchase-categories" && (
          <MasterCrudPanel
            title="Kategori Pembelian"
            apiPath="/api/master/purchase-categories"
            fields={[
              { key: "category", label: "Kategori", type: "text", required: true },
              { key: "sub_category", label: "Sub-kategori", type: "text", required: true },
              { key: "coa_account", label: "Akun COA", type: "select", optionsKey: "coa_accounts", required: true },
              { key: "active", label: "Aktif", type: "checkbox" }
            ]}
            columns={[
              { key: "category", label: "Kategori" },
              { key: "sub_category", label: "Sub" },
              { key: "coa_account", label: "Akun COA" },
              { key: "active", label: "Status" }
            ]}
          />
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        Pondasi POS/stok: warehouses, stock_levels, product_recipes sudah di schema. UI POS menyusul —
        deduct stok hanya untuk produk dengan <code className="text-[11px]">effective_tracks_stock = true</code>.
      </p>
    </main>
  );
}
