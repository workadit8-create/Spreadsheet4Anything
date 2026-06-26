"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MasterCrudPanel } from "@/components/master/MasterCrudPanel";
import { BusinessProfilePanel } from "@/components/master/BusinessProfilePanel";
import { OutletsMasterPanel } from "@/components/master/OutletsMasterPanel";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PRODUCT_KIND_LABELS } from "@/lib/products/inventory-policy";
import {
  MASTER_TAB_LABELS,
  OWNER_ONLY_ROLES,
  isInventoryMasterTab,
  masterContentTabsForOrg,
  masterNavTabsForOrg,
  type MasterTabId,
  type MembershipRole
} from "@/lib/org/roles";

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

const TABS = (Object.keys(MASTER_TAB_LABELS) as MasterTabId[]).map((id) => ({
  id,
  label: MASTER_TAB_LABELS[id]
}));

export default function MasterDataClient({
  role,
  outletAddonEnabled,
  inventoryAddonEnabled
}: {
  role: MembershipRole;
  outletAddonEnabled: boolean;
  inventoryAddonEnabled: boolean;
}) {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  const contentTabs = useMemo(() => {
    const allowed = new Set(
      masterContentTabsForOrg(role, { outletAddonEnabled })
    );
    return TABS.filter((t) => allowed.has(t.id));
  }, [role, outletAddonEnabled]);

  const navigableTabs = useMemo(() => {
    const allowed = new Set(
      masterNavTabsForOrg(role, { inventoryAddonEnabled, outletAddonEnabled })
    );
    return TABS.filter((t) => allowed.has(t.id));
  }, [role, inventoryAddonEnabled, outletAddonEnabled]);

  const inventorySplit = inventoryAddonEnabled;

  const initialTab = useMemo(() => {
    if (tabFromUrl && contentTabs.some((t) => t.id === tabFromUrl)) {
      return tabFromUrl as MasterTabId;
    }
    return navigableTabs[0]?.id ?? contentTabs[0]?.id ?? "customers";
  }, [tabFromUrl, contentTabs, navigableTabs]);

  const [tab, setTab] = useState<MasterTabId>(initialTab);
  const isInventoryView = inventorySplit && isInventoryMasterTab(tab);
  const canEditProfile = OWNER_ONLY_ROLES.includes(role);

  useEffect(() => {
    if (tabFromUrl && contentTabs.some((t) => t.id === tabFromUrl)) {
      setTab(tabFromUrl as MasterTabId);
    }
  }, [tabFromUrl, contentTabs]);

  useEffect(() => {
    if (!contentTabs.some((t) => t.id === tab)) {
      setTab(navigableTabs[0]?.id ?? contentTabs[0]?.id ?? "customers");
    }
  }, [contentTabs, navigableTabs, tab]);

  if (!contentTabs.length) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <PageHeader badge="Master Data" title="Master Data" />
        <Card className="p-6 text-sm text-slate-600">
          Peran Anda tidak punya akses mengubah data master. Hubungi owner jika perlu perubahan.
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge={isInventoryView ? "Management Inventory" : "Master Data"}
        title={isInventoryView ? MASTER_TAB_LABELS[tab] : "Master Data"}
        description={
          isInventoryView
            ? "Kelola master inventory — diakses dari menu Management Inventory."
            : inventorySplit
              ? "Customer, COA, kas, kategori expense. Supplier & produk ada di Management Inventory."
              : "Multi-usaha: retail, F&B, manufaktur, jasa. Kategori produk atur apakah item kelola stok."
        }
      />

      {canEditProfile ? <BusinessProfilePanel /> : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {navigableTabs.map((t) => (
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

      {isInventoryView ? (
        <p className="mb-4 text-xs text-slate-500">
          Tab ini tidak ada di Master Data — buka lewat sidebar{" "}
          <strong>Management Inventory</strong>.
        </p>
      ) : null}

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
            productTaxFromApi
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
        )}
        {tab === "purchase-categories" && (
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
        )}
        {tab === "outlets" && <OutletsMasterPanel />}
      </Card>

      {outletAddonEnabled && !inventorySplit ? (
      <p className="mt-4 text-xs text-slate-400">
        Multi-outlet: kelola di tab Outlet. POS memilih outlet saat buka kasir. Laporan L/R per outlet di menu Laporan.
      </p>
      ) : null}
    </main>
  );
}
