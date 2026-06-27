"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { InventoryPembelianForm } from "@/components/inventory/InventoryPembelianForm";

export default function InventoryPembelianPageClient() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        badge="Pembelian · Inventory"
        title="Purchase Order"
        description="Beli barang ke gudang outlet — posting jurnal persediaan + stok masuk otomatis."
      >
        <Link
          href="/dashboard/inventory/pembelian/riwayat"
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Riwayat PO →
        </Link>
      </PageHeader>

      <Card className="p-4">
        <InventoryPembelianForm />
      </Card>
    </main>
  );
}
