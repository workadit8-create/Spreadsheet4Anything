"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BusinessProfilePanel } from "@/components/master/BusinessProfilePanel";
import { MasterTabPanel } from "@/components/master/MasterTabPanel";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  MASTER_TAB_LABELS,
  OWNER_ONLY_ROLES,
  isInventoryMasterTab,
  masterContentTabsForOrg,
  masterNavTabsForOrg,
  type MasterTabId,
  type MembershipRole
} from "@/lib/org/roles";

const TABS = (Object.keys(MASTER_TAB_LABELS) as MasterTabId[]).map((id) => ({
  id,
  label: MASTER_TAB_LABELS[id]
}));

const INVENTORY_TAB_REDIRECT: Partial<Record<MasterTabId, string>> = {
  suppliers: "/dashboard/inventory/suppliers",
  "product-categories": "/dashboard/inventory/product-categories",
  products: "/dashboard/inventory/products",
  outlets: "/dashboard/inventory/outlets"
};

export default function MasterDataClient({
  role,
  outletAddonEnabled,
  inventoryAddonEnabled
}: {
  role: MembershipRole;
  outletAddonEnabled: boolean;
  inventoryAddonEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  const contentTabs = useMemo(() => {
    const allowed = new Set(masterContentTabsForOrg(role, { outletAddonEnabled }));
    return TABS.filter((t) => allowed.has(t.id));
  }, [role, outletAddonEnabled]);

  const navigableTabs = useMemo(() => {
    const allowed = new Set(
      masterNavTabsForOrg(role, { inventoryAddonEnabled, outletAddonEnabled })
    );
    return TABS.filter((t) => allowed.has(t.id));
  }, [role, inventoryAddonEnabled, outletAddonEnabled]);

  const initialTab = useMemo(() => {
    if (tabFromUrl && contentTabs.some((t) => t.id === tabFromUrl)) {
      return tabFromUrl as MasterTabId;
    }
    return navigableTabs[0]?.id ?? contentTabs[0]?.id ?? "customers";
  }, [tabFromUrl, contentTabs, navigableTabs]);

  const [tab, setTab] = useState<MasterTabId>(initialTab);
  const canEditProfile = OWNER_ONLY_ROLES.includes(role);

  useEffect(() => {
    if (!inventoryAddonEnabled || !tabFromUrl) return;
    const dest = INVENTORY_TAB_REDIRECT[tabFromUrl as MasterTabId];
    if (dest) router.replace(dest);
  }, [inventoryAddonEnabled, tabFromUrl, router]);

  useEffect(() => {
    if (tabFromUrl && contentTabs.some((t) => t.id === tabFromUrl)) {
      if (inventoryAddonEnabled && isInventoryMasterTab(tabFromUrl as MasterTabId)) return;
      setTab(tabFromUrl as MasterTabId);
    }
  }, [tabFromUrl, contentTabs, inventoryAddonEnabled]);

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
        badge="Master · Finance"
        title="Master Data"
        description={
          inventoryAddonEnabled
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

      <Card>
        <MasterTabPanel tab={tab} />
      </Card>

      {outletAddonEnabled && !inventoryAddonEnabled ? (
        <p className="mt-4 text-xs text-slate-400">
          Multi-outlet: kelola di tab Outlet. POS memilih outlet saat buka kasir. Laporan L/R per outlet di menu Laporan.
        </p>
      ) : null}
    </main>
  );
}
