"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PurchaseReturnForm } from "@/components/inventory/PurchaseReturnForm";
import { PurchaseReturnHistoryClient } from "@/components/inventory/PurchaseReturnHistoryClient";
import { ConsignmentFormCard, ConsignmentPageShell } from "@/components/inventory/consignment-layout";
import type { MembershipRole } from "@/lib/org/roles";

export function PurchaseReturnPageClient({ role }: { role: MembershipRole }) {
  const [tab, setTab] = useState<"form" | "history">("form");
  const [historyKey, setHistoryKey] = useState(0);

  return (
    <ConsignmentPageShell>
      <PageHeader
        badge="Management Inventory"
        title="Retur Pembelian"
        description="Kembalikan barang ke supplier — stok keluar, HPP & jurnal persediaan disesuaikan"
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("form")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "form"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Buat retur
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "history"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Riwayat
        </button>
      </div>

      {tab === "form" ? (
        <ConsignmentFormCard>
          <PurchaseReturnForm
            onCreated={() => {
              setHistoryKey((k) => k + 1);
            }}
          />
        </ConsignmentFormCard>
      ) : (
        <PurchaseReturnHistoryClient key={historyKey} role={role} />
      )}
    </ConsignmentPageShell>
  );
}
