"use client";

import { useState } from "react";
import { MasterCrudPanel } from "@/components/master/MasterCrudPanel";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

const TABS = [
  { id: "customers", label: "Customer" },
  { id: "products", label: "Produk" },
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
        description="Simpan ke Supabase (< 2 detik). Sync ke sheet GAS menyusul per modul transaksi."
      />

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
        {tab === "products" && (
          <MasterCrudPanel
            title="Produk"
            apiPath="/api/master/products"
            fields={[
              { key: "sku", label: "Kode/SKU", type: "text" },
              { key: "name", label: "Nama", type: "text", required: true },
              { key: "sell_price", label: "Harga", type: "number", required: true },
              { key: "unit_id", label: "Satuan", type: "select", optionsKey: "units" },
              { key: "akunPendapatan", label: "Akun pendapatan", type: "text", metaKey: "akunPendapatan", placeholder: "Pendapatan" },
              { key: "active", label: "Aktif", type: "checkbox" }
            ]}
            columns={[
              { key: "sku", label: "SKU" },
              { key: "name", label: "Nama" },
              { key: "sell_price", label: "Harga" },
              { key: "akunPendapatan", label: "Akun", metaKey: "akunPendapatan" },
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
              { key: "coa_account_name", label: "Nama akun COA", type: "text", required: true },
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
              { key: "coa_account", label: "Akun COA", type: "text", required: true },
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
        Pondasi stok/POS: products, warehouses, units sudah di schema — UI menyusul di fase terakhir.
      </p>
    </main>
  );
}
