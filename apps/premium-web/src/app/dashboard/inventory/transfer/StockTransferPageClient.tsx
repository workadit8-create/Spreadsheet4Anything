"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StockTransferForm } from "@/components/inventory/StockTransferForm";
import { StockTransferHistoryClient } from "@/components/inventory/StockTransferHistoryClient";
import { ConsignmentFormCard, ConsignmentPageShell } from "@/components/inventory/consignment-layout";

export function StockTransferPageClient() {
  const [tab, setTab] = useState<"form" | "history">("form");
  const [historyKey, setHistoryKey] = useState(0);

  return (
    <ConsignmentPageShell>
      <PageHeader
        badge="Management Inventory"
        title="Stock Transfer"
        description="Pindahkan stok antar gudang dalam outlet yang sama — display ↔ backroom, distribusi → outlet"
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("form")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "form" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Buat transfer
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "history" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Riwayat
        </button>
      </div>

      {tab === "form" ? (
        <ConsignmentFormCard>
          <StockTransferForm
            onCreated={() => {
              setHistoryKey((k) => k + 1);
            }}
          />
        </ConsignmentFormCard>
      ) : (
        <StockTransferHistoryClient key={historyKey} />
      )}
    </ConsignmentPageShell>
  );
}
