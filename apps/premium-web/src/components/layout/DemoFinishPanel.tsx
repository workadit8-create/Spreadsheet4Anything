"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function DemoFinishPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function finishDemo(resetOnly: boolean) {
    const confirmed = window.confirm(
      resetOnly
        ? "Reset semua data demo ke kondisi awal?"
        : "Selesai coba? Data demo akan direset dan Anda akan logout."
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage(null);
    try {
      if (resetOnly) {
        const res = await fetch("/api/org/demo-reset", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setMessage("Data demo direset");
        router.refresh();
      } else {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        router.push(data.redirect || "/login");
        router.refresh();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal reset demo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-[11px] text-amber-100">
      <p className="font-semibold text-amber-200">Mode demo</p>
      <p className="mt-1 text-amber-100/80">
        Setelah selesai, reset supaya pengguna berikutnya dapat kondisi bersih.
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          className="w-full py-1.5 text-xs"
          onClick={() => void finishDemo(false)}
        >
          {loading ? "Memproses…" : "Selesai coba & reset"}
        </Button>
        <button
          type="button"
          disabled={loading}
          className="text-[10px] text-amber-200/90 underline hover:text-amber-100"
          onClick={() => void finishDemo(true)}
        >
          Reset saja (tetap login)
        </button>
      </div>
      {message && <p className="mt-2 text-[10px] text-amber-100">{message}</p>}
    </div>
  );
}
