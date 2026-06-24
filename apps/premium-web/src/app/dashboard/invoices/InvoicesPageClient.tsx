"use client";

import Link from "next/link";
import { useState } from "react";
import { InvoiceCreateForm } from "@/components/InvoiceCreateForm";
import { InvoiceListPanel } from "@/components/InvoiceListPanel";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export default function InvoicesPageClient() {
  const [listKey, setListKey] = useState(0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        badge="Step 3 · Bridge"
        title="Invoice → posting_jobs → BACKENDengine"
        description="Premium Web → Supabase queue → HYBRID LAB GAS backend"
      >
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">← Dashboard</Link>
      </PageHeader>

      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Buat invoice lab</h2>
          <InvoiceCreateForm onCreated={() => setListKey((k) => k + 1)} />
        </Card>

        <Card>
          <InvoiceListPanel key={listKey} />
        </Card>
      </div>
    </main>
  );
}
