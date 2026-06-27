"use client";

import { useState } from "react";
import { ConsignmentReturnForm } from "@/components/inventory/ConsignmentReturnForm";
import { ConsignmentSettlementForm } from "@/components/inventory/ConsignmentSettlementForm";
import { ConsignmentFormCard } from "@/components/inventory/consignment-layout";

export function ConsignmentSettlementPageClient() {
  const [mode, setMode] = useState<"settlement" | "return">("settlement");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("settlement")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            mode === "settlement"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Pelunasan (sudah laku)
        </button>
        <button
          type="button"
          onClick={() => setMode("return")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            mode === "return"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Retur barang (belum laku)
        </button>
      </div>

      <ConsignmentFormCard>
        {mode === "settlement" ? <ConsignmentSettlementForm /> : <ConsignmentReturnForm />}
      </ConsignmentFormCard>
    </div>
  );
}
