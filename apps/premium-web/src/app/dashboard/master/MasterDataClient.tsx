"use client";

import { useState } from "react";
import { MasterCrudPanel } from "@/components/master/MasterCrudPanel";

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
    <main style={{ padding: "28px 24px", maxWidth: 1100 }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 700 }}>FASE 1 · MASTER DATA</p>
        <h1 style={{ margin: "6px 0 4px" }}>Master Data</h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
          Simpan ke Supabase (&lt; 2 detik). Sync ke sheet GAS menyusul per modul transaksi.
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: tab === t.id ? "1px solid #2563eb" : "1px solid #e2e8f0",
              background: tab === t.id ? "#eff6ff" : "#fff",
              color: tab === t.id ? "#2563eb" : "#334155",
              fontWeight: tab === t.id ? 600 : 400,
              cursor: "pointer",
              fontSize: 13
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
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
      </section>

      <p style={{ marginTop: 16, fontSize: 12, color: "#94a3b8" }}>
        COA penuh & sync ke sheet MASTER_* — fase berikutnya. Pondasi stok/POS: tabel products, warehouses, units sudah di schema.
      </p>
    </main>
  );
}
