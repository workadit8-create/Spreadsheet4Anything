"use client";

import Link from "next/link";
import { useState } from "react";
import { InvoiceCreateForm } from "@/components/InvoiceCreateForm";
import { InvoiceProperForm } from "@/components/InvoiceProperForm";
import { InvoiceListPanel } from "@/components/InvoiceListPanel";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

type Tab = "proper" | "lab";

export default function InvoicesPageClient() {
  const [listKey, setListKey] = useState(0);
  const [tab, setTab] = useState<Tab>("proper");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Pemasukan · Invoice"
        title="Invoice penjualan"
        description="Customer + produk dari master → Supabase → jurnal di journal_entries"
      >
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">← Dashboard</Link>
      </PageHeader>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("proper")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "proper"
              ? "bg-brand-600 text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          Invoice baru
        </button>
        <button
          type="button"
          onClick={() => setTab("lab")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            tab === "lab"
              ? "bg-brand-600 text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          Lab (legacy)
        </button>
      </div>

      <div className="space-y-6">
        <Card>
          {tab === "proper" ? (
            <>
              <h2 className="mb-4 text-base font-semibold text-slate-900">Buat invoice</h2>
              <InvoiceProperForm onCreated={() => setListKey((k) => k + 1)} />
            </>
          ) : (
            <>
              <h2 className="mb-4 text-base font-semibold text-slate-900">Invoice lab (tanpa master)</h2>
              <InvoiceCreateForm onCreated={() => setListKey((k) => k + 1)} />
            </>
          )}
        </Card>

        <Card>
          <InvoiceListPanel key={listKey} />
        </Card>
      </div>
    </main>
  );
}
