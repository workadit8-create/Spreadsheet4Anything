"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Logout gagal");
      router.push(data.redirect || "/login");
      router.refresh();
    } catch {
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void onLogout()}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-[11px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
    >
      {loading ? "Keluar…" : "Keluar / Logout"}
    </button>
  );
}
