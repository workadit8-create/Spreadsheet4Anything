"use client";

import Link from "next/link";
import { useState } from "react";
import { InvoiceCreateForm } from "@/components/InvoiceCreateForm";
import { InvoiceProperForm } from "@/components/InvoiceProperForm";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

type Tab = "proper" | "lab";

export default function PenjualanPageClient() {
  const [tab, setTab] = useState<Tab>("proper");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Pemasukan · Penjualan"
        title="Penjualan"
        description="Buat invoice penjualan → Supabase → posting jurnal manual dari riwayat"
      >
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/penjualan/riwayat"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Riwayat invoice →
          </Link>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← Dashboard
          </Link>
        </div>
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

      <Card>
        {tab === "proper" ? (
          <>
            <h2 className="mb-4 text-base font-semibold text-slate-900">Buat invoice</h2>
            <InvoiceProperForm onCreated={() => undefined} />
          </>
        ) : (
          <>
            <h2 className="mb-4 text-base font-semibold text-slate-900">Invoice lab (tanpa master)</h2>
            <InvoiceCreateForm onCreated={() => undefined} />
          </>
        )}
      </Card>
    </main>
  );
}
