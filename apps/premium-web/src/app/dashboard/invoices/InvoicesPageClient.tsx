"use client";

import Link from "next/link";
import { useState } from "react";
import { InvoiceCreateForm } from "@/components/InvoiceCreateForm";
import { InvoiceListPanel } from "@/components/InvoiceListPanel";

export default function InvoicesPageClient() {
  const [listKey, setListKey] = useState(0);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
        <div>
          <p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 700 }}>STEP 3 · BRIDGE</p>
          <h1 style={{ margin: "6px 0 4px" }}>Invoice → posting_jobs → BACKENDengine</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Premium Web → Supabase queue → HYBRID LAB GAS backend
          </p>
        </div>
        <Link href="/dashboard" style={{ color: "#64748b", fontSize: 14 }}>← Dashboard</Link>
      </header>

      <div style={{ display: "grid", gap: 20 }}>
        <section style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Buat invoice lab</h2>
          <InvoiceCreateForm onCreated={() => setListKey((k) => k + 1)} />
        </section>

        <section style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <InvoiceListPanel key={listKey} />
        </section>
      </div>
    </main>
  );
}
