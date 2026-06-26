"use client";

import Link from "next/link";
import { PembelianForm } from "@/components/PembelianForm";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export default function PembelianPageClient() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Pengeluaran · Expense"
        title="Expense"
        description="Supplier + kategori expense → simpan → posting jurnal manual dari riwayat"
      >
        <div className="flex items-center gap-3">
          <Link href="/dashboard/pembelian/riwayat" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Riwayat Expense →
          </Link>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">← Dashboard</Link>
        </div>
      </PageHeader>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Input expense</h2>
        <PembelianForm />
      </Card>
    </main>
  );
}
