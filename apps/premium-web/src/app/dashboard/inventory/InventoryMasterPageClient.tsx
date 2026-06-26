"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MasterTabPanel } from "@/components/master/MasterTabPanel";
import { MASTER_TAB_LABELS, type MasterTabId } from "@/lib/org/roles";

const INVENTORY_TAB_PATH: Partial<Record<MasterTabId, string>> = {
  suppliers: "/dashboard/inventory/suppliers",
  "product-categories": "/dashboard/inventory/product-categories",
  products: "/dashboard/inventory/products",
  outlets: "/dashboard/inventory/outlets"
};

export default function InventoryMasterPageClient({ tab }: { tab: MasterTabId }) {
  const siblings = (Object.keys(INVENTORY_TAB_PATH) as MasterTabId[]).filter((id) => id !== tab);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Management Inventory"
        title={MASTER_TAB_LABELS[tab]}
        description="Kelola master inventory — terpisah dari Master · Finance."
      >
        <Link href="/dashboard/master" className="text-sm text-slate-500 hover:text-slate-700">
          Master · Finance →
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {siblings.map((id) => (
          <Link
            key={id}
            href={INVENTORY_TAB_PATH[id] || "#"}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {MASTER_TAB_LABELS[id]}
          </Link>
        ))}
      </div>

      <Card>
        <MasterTabPanel tab={tab} />
      </Card>
    </main>
  );
}
