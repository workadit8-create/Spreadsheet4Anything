"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";

type SyncEvent = {
  id: string;
  direction: string;
  source: string;
  status: string;
  error: string | null;
  created_at: string;
  payload: { orderNo?: string; transactionId?: string };
};

type Props = {
  stats: {
    postedJobs: number;
    failedJobs: number;
    pendingJobs: number;
    sheetSynced: number;
    sheetPending: number;
    totalOrders: number;
  };
  syncEvents: SyncEvent[];
  gasWebappUrl?: string;
  databaseSheetId?: string;
};

export default function LaporanPageClient({ stats, syncEvents, gasWebappUrl, databaseSheetId }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retrySheetSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/posting/sync-sheet", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const orderOk = (data.orders || []).filter((r: { ok: boolean }) => r.ok).length;
      const pelunasanOk = (data.pelunasan || []).filter((r: { ok: boolean }) => r.ok).length;
      setMessage(
        `Sync sheet: ${orderOk} invoice + ${pelunasanOk} pelunasan berhasil (total ${data.synced || 0} dicoba)`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal sync");
    } finally {
      setSyncing(false);
    }
  }

  const sheetUrl = databaseSheetId
    ? `https://docs.google.com/spreadsheets/d/${databaseSheetId}/edit`
    : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        badge="Step 4 · Sync balik"
        title="Laporan bridge"
        description="Status posting jurnal + sync ke sheet PEMASUKAN"
      >
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">← Dashboard</Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Invoice total" value={stats.totalOrders} />
        <StatCard label="Jurnal POSTED" value={stats.postedJobs} tone="success" />
        <StatCard label="Jurnal FAILED" value={stats.failedJobs} tone="danger" />
        <StatCard label="Queue PENDING" value={stats.pendingJobs} />
        <StatCard label="Sheet synced" value={stats.sheetSynced} tone="success" />
        <StatCard label="Sheet pending" value={stats.sheetPending} tone="warning" />
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Aksi</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={retrySheetSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Retry sync sheet PEMASUKAN"}
          </Button>
          <Link
            href="/dashboard/invoices"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
          >
            Invoice lab
          </Link>
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            >
              Buka client DB sheet
            </a>
          )}
          {gasWebappUrl && (
            <a
              href={gasWebappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            >
              Buka GAS web app
            </a>
          )}
        </div>
        {message && <p className="mt-3 text-sm text-slate-500">{message}</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Sync events (terbaru)</h2>
        {!syncEvents.length ? (
          <p className="text-sm text-slate-500">Belum ada sync event.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500">
                  <th className="border-b border-slate-200 px-2 py-2">Waktu</th>
                  <th className="border-b border-slate-200 px-2 py-2">Invoice</th>
                  <th className="border-b border-slate-200 px-2 py-2">Status</th>
                  <th className="border-b border-slate-200 px-2 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {syncEvents.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/80">
                    <td className="border-b border-slate-100 px-2 py-2 text-xs">
                      {new Date(e.created_at).toLocaleString("id-ID")}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2">
                      <code className="text-xs">{e.payload?.orderNo || "—"}</code>
                    </td>
                    <td
                      className={`border-b border-slate-100 px-2 py-2 font-semibold ${
                        e.status === "DONE"
                          ? "text-emerald-600"
                          : e.status === "FAILED"
                            ? "text-red-600"
                            : "text-slate-500"
                      }`}
                    >
                      {e.status}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2 text-xs text-red-600">
                      {e.error || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
