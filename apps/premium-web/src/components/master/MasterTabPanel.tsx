"use client";

import { MasterCrudPanel } from "@/components/master/MasterCrudPanel";
import { OutletsMasterPanel } from "@/components/master/OutletsMasterPanel";
import { PRODUCT_KIND_LABELS } from "@/lib/products/inventory-policy";
import type { MasterTabId } from "@/lib/org/roles";

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

export function MasterTabPanel({ tab }: { tab: MasterTabId }) {
  if (tab === "customers") {
    return (
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
    );
  }

  if (tab === "product-categories") {
    return (
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
    );
  }

  if (tab === "products") {
    return (
      <MasterCrudPanel
        title="Produk"
        apiPath="/api/master/products"
        productTaxFromApi
        productInventoryFromApi
        fields={[
          { key: "sku", label: "Barcode / Kode", type: "text" },
          { key: "name", label: "Nama", type: "text", required: true },
          { key: "sell_price", label: "Harga jual", type: "number", required: true },
          {
            key: "outlet",
            label: "Outlet",
            type: "select",
            metaKey: "outlet",
            optionsKey: "outlets"
          },
          {
            key: "category_id",
            label: "Kategori",
            type: "select",
            optionsKey: "categories"
          },
          {
            key: "stock_policy",
            label: "Kelola stok",
            type: "select",
            options: [
              { value: "track", label: "Ya — kelola stok" },
              { value: "no_track", label: "Tidak — tanpa stok" },
              { value: "inherit", label: "Ikuti kategori" }
            ]
          },
          {
            key: "hpp",
            label: "HPP (harga pokok)",
            type: "number",
            metaKey: "hpp",
            whenTrackStock: true,
            placeholder: "Per satuan, statis"
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
          { key: "sku", label: "Barcode" },
          { key: "name", label: "Nama" },
          { key: "outlet_label", label: "Outlet" },
          { key: "category_name", label: "Kategori" },
          { key: "tracks_stock_label", label: "Stok" },
          { key: "hpp", label: "HPP", format: "money" },
          { key: "sell_price", label: "Harga jual", format: "money" },
          { key: "akunPendapatan", label: "Akun", metaKey: "akunPendapatan" },
          { key: "active", label: "Status" }
        ]}
      />
    );
  }

  if (tab === "units") {
    return (
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
    );
  }

  if (tab === "coa") {
    return (
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
    );
  }

  if (tab === "kas-bank") {
    return (
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
          { key: "bank_name", label: "Nama bank", type: "text", metaKey: "bank_name" },
          { key: "account_no", label: "No. rekening", type: "text", metaKey: "account_no" },
          { key: "account_holder", label: "Atas nama", type: "text", metaKey: "account_holder" },
          { key: "active", label: "Aktif", type: "checkbox" }
        ]}
        columns={[
          { key: "code", label: "Kode" },
          { key: "name", label: "Rekening" },
          { key: "account_no", label: "No. rekening", metaKey: "account_no" },
          { key: "coa_account_name", label: "Akun COA" },
          { key: "active", label: "Status" }
        ]}
      />
    );
  }

  if (tab === "suppliers") {
    return (
      <MasterCrudPanel
        title="Supplier"
        apiPath="/api/master/suppliers"
        fields={[
          { key: "code", label: "Kode", type: "text" },
          { key: "name", label: "Nama", type: "text", required: true },
          { key: "phone", label: "Telepon", type: "text" },
          { key: "email", label: "Email", type: "text" },
          { key: "pkp", label: "Supplier PKP (PPN masukan)", type: "checkbox" },
          { key: "active", label: "Aktif", type: "checkbox" }
        ]}
        columns={[
          { key: "code", label: "Kode" },
          { key: "name", label: "Nama" },
          { key: "phone", label: "Telepon" },
          { key: "email", label: "Email" },
          { key: "pkp", label: "PKP", format: "boolean" },
          { key: "active", label: "Status" }
        ]}
      />
    );
  }

  if (tab === "purchase-categories") {
    return (
      <MasterCrudPanel
        title="Kategori Expense"
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
    );
  }

  if (tab === "outlets") {
    return <OutletsMasterPanel />;
  }

  return null;
}
