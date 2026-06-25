"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AddonInfo } from "@/lib/org/addons-catalog";
import { Button } from "@/components/ui/Button";

export function AddonsLabPanel({
  onAddonsChange
}: {
  onAddonsChange?: (addons: AddonInfo[]) => void;
}) {
  const onChangeRef = useRef(onAddonsChange);
  onChangeRef.current = onAddonsChange;

  const [addons, setAddons] = useState<AddonInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const syncAddons = useCallback((list: AddonInfo[]) => {
    setAddons(list);
    onChangeRef.current?.(list);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/org/addons");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!cancelled) syncAddons(data.addons || []);
      } catch (e) {
        if (!cancelled) {
          setMessage(e instanceof Error ? e.message : "Gagal memuat add-on");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [syncAddons]);

  async function toggle(key: string, enabled: boolean) {
    setActing(key);
    setMessage(null);
    try {
      const res = await fetch("/api/org/addons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_key: key, enabled })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      syncAddons(data.addons || []);
      setMessage(enabled ? "Add-on aktif — menu diperbarui" : "Add-on dimatikan");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setActing(null);
    }
  }

  if (loading && addons.length === 0) {
    return <p className="text-[11px] text-slate-400">Memuat add-on…</p>;
  }

  return (
    <div className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-3 text-[11px] text-violet-100">
      <p className="font-semibold text-violet-200">Lab · Add-on</p>
      <p className="mt-1 text-violet-100/80">Toggle modul untuk pengujian hybrid-lab.</p>
      <ul className="mt-2 space-y-1.5">
        {addons.map((a) => (
          <li key={a.key} className="flex items-center justify-between gap-2">
            <span>
              {a.label}
              <span className="ml-1 text-violet-200/60">({a.key})</span>
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={acting === a.key}
              className="py-0.5 text-[10px]"
              onClick={() => void toggle(a.key, !a.enabled)}
            >
              {acting === a.key ? "…" : a.enabled ? "On" : "Off"}
            </Button>
          </li>
        ))}
      </ul>
      {message && <p className="mt-2 text-[10px] text-violet-100">{message}</p>}
    </div>
  );
}
