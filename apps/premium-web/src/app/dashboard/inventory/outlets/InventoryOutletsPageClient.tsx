"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { OutletsMasterPanel } from "@/components/master/OutletsMasterPanel";

export default function InventoryOutletsPageClient() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        badge="Management Inventory"
        title="Outlet / Cabang"
        description="Outlet toko (MART, CAFE, FASHION). Setiap outlet dihubungkan ke satu gudang untuk stok & opname."
      >
        <Link
          href="/dashboard/inventory/warehouse"
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          ← Warehouse
        </Link>
      </PageHeader>

      <Card className="p-4">
        <OutletsMasterPanel />
      </Card>
    </main>
  );
}
