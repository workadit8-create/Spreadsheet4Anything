"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { OnboardingStatus } from "@/lib/org/onboarding-status";

export function OnboardingChecklist() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/org/onboarding");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || dismissed || !status || status.complete) {
    return null;
  }

  const pct = Math.round((status.completedCount / status.totalCount) * 100);

  return (
    <Card className="mb-8 border-brand-200 bg-gradient-to-br from-brand-50/80 to-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Setup organisasi</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">
            Checklist onboarding — {status.org.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {status.completedCount} dari {status.totalCount} langkah selesai ({pct}%)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Sembunyikan
        </button>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-brand-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-5 space-y-3">
        {status.steps.map((step) => (
          <li
            key={step.id}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
              step.done
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-slate-200 bg-white"
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                step.done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              {step.done ? "✓" : "·"}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${step.done ? "text-emerald-900" : "text-slate-900"}`}>
                {step.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>
              {!step.done && (
                <Link
                  href={step.href}
                  className="mt-1.5 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  Buka →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] text-slate-400">
        Panduan admin (buat org + user):{" "}
        <code className="text-[10px]">scripts/onboard-premium-client.sql</code>
      </p>
    </Card>
  );
}
