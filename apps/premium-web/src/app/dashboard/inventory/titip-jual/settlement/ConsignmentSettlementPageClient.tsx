"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { ConsignmentReturnForm } from "@/components/inventory/ConsignmentReturnForm";
import { ConsignmentSettlementForm } from "@/components/inventory/ConsignmentSettlementForm";

export function ConsignmentSettlementPageClient() {
  const [mode, setMode] = useState<"settlement" | "return">("settlement");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
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

      <Card className="p-4">
        {mode === "settlement" ? <ConsignmentSettlementForm /> : <ConsignmentReturnForm />}
      </Card>
    </div>
  );
}
