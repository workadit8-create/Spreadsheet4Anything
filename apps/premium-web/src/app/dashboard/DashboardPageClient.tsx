"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import type { BalanceSlice, MonthlyTrendPoint } from "@/lib/dashboard/chart-data";

type Summary = {
  org: { id: string; name: string; slug: string };
  period: { start: string; end: string };
  penjualanBulanIni: number;
  pembelianBulanIni: number;
  totalPiutang: number;
  totalHutang: number;
  totalKasSaldo: number;
  saldoByAccount: Record<string, number>;
  monthlyTrend: MonthlyTrendPoint[];
  balanceMix: BalanceSlice[];
  pendingPost: { invoices: number; purchaseOrders: number };
  recentSales: Array<{
    id: string;
    docNo: string;
    date: string;
    total: number;
    status: string;
    label: string;
  }>;
  recentPurchases: Array<{
    id: string;
    docNo: string;
    date: string;
    total: number;
    status: string;
    label: string;
  }>;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function statusClass(status: string) {
  if (status === "POSTED") return "text-emerald-600";
  if (status === "VOIDED") return "text-red-600";
  if (status === "CONFIRMED") return "text-amber-600";
  return "text-slate-500";
}

export default function DashboardPageClient({ userEmail }: { userEmail?: string | null }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/summary");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat dashboard");
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const orgName = summary?.org.name || "…";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        badge="Premium"
        title="Dashboard"
        description={userEmail ?? undefined}
      >
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          {loading ? "Memuat…" : "Refresh"}
        </button>
      </PageHeader>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <OnboardingChecklist />

      {loading && !summary ? (
        <p className="text-sm text-slate-500">Memuat ringkasan…</p>
      ) : summary ? (
        <>
          <p className="mb-6 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{orgName}</span>
            <span className="mx-2 text-slate-300">·</span>
            Periode {summary.period.start} s/d {summary.period.end}
          </p>

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Penjualan bulan ini" value={formatRp(summary.penjualanBulanIni)} />
            <StatCard label="Pembelian bulan ini" value={formatRp(summary.pembelianBulanIni)} />
            <StatCard label="Piutang outstanding" value={formatRp(summary.totalPiutang)} tone="warning" />
            <StatCard label="Hutang outstanding" value={formatRp(summary.totalHutang)} tone="warning" />
          </div>

          <DashboardCharts monthlyTrend={summary.monthlyTrend} balanceMix={summary.balanceMix} />

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Saldo kas & bank (mutasi)" value={formatRp(summary.totalKasSaldo)} tone="success" />
            <StatCard
              label="Invoice belum posting"
              value={summary.pendingPost.invoices}
              tone={summary.pendingPost.invoices > 0 ? "warning" : undefined}
            />
            <StatCard
              label="PO belum posting"
              value={summary.pendingPost.purchaseOrders}
              tone={summary.pendingPost.purchaseOrders > 0 ? "warning" : undefined}
            />
          </div>

          {(summary.pendingPost.invoices > 0 || summary.pendingPost.purchaseOrders > 0) && (
            <Card className="mb-8 border-amber-200 bg-amber-50/80">
              <h2 className="text-sm font-semibold text-amber-900">Perlu tindakan</h2>
              <p className="mt-1 text-sm text-amber-800">
                Ada transaksi CONFIRMED yang belum diposting ke jurnal.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.pendingPost.invoices > 0 && (
                  <Link
                    href="/dashboard/penjualan/riwayat"
                    className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-50"
                  >
                    {summary.pendingPost.invoices} invoice →
                  </Link>
                )}
                {summary.pendingPost.purchaseOrders > 0 && (
                  <Link
                    href="/dashboard/pembelian/riwayat"
                    className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-50"
                  >
                    {summary.pendingPost.purchaseOrders} PO →
                  </Link>
                )}
              </div>
            </Card>
          )}

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-base font-semibold text-slate-900">Saldo per rekening</h2>
              {!Object.keys(summary.saldoByAccount).length ? (
                <p className="text-sm text-slate-500">Belum ada rekening kas/bank.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {Object.entries(summary.saldoByAccount).map(([name, saldo]) => (
                    <li key={name} className="flex justify-between border-b border-slate-100 py-2">
                      <span className="text-slate-700">{name}</span>
                      <span className="font-semibold tabular-nums">{formatRp(saldo)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/dashboard/kas-bank"
                className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Kas & Bank →
              </Link>
            </Card>

            <Card>
              <h2 className="mb-3 text-base font-semibold text-slate-900">Akses cepat</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { href: "/dashboard/penjualan", label: "Penjualan" },
                  { href: "/dashboard/pembelian", label: "Pembelian" },
                  { href: "/dashboard/quotation", label: "Quotation" },
                  { href: "/dashboard/purchase-request", label: "Purchase Request" },
                  { href: "/dashboard/piutang", label: "Piutang" },
                  { href: "/dashboard/hutang", label: "Hutang" },
                  { href: "/dashboard/jurnal", label: "Jurnal" },
                  { href: "/dashboard/laporan", label: "Laporan" },
                  { href: "/dashboard/master", label: "Master Data" }
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Invoice terbaru</h2>
                <Link href="/dashboard/penjualan/riwayat" className="text-xs font-medium text-brand-600">
                  Semua →
                </Link>
              </div>
              {!summary.recentSales.length ? (
                <p className="text-sm text-slate-500">Belum ada invoice.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.recentSales.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="py-2 pr-2">
                          <code className="text-xs">{row.docNo}</code>
                          <div className="text-xs text-slate-500">{row.label || row.date}</div>
                        </td>
                        <td className="py-2 text-right font-medium">{formatRp(row.total)}</td>
                        <td className={`py-2 pl-2 text-right text-xs font-semibold ${statusClass(row.status)}`}>
                          {row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">PO terbaru</h2>
                <Link href="/dashboard/pembelian/riwayat" className="text-xs font-medium text-brand-600">
                  Semua →
                </Link>
              </div>
              {!summary.recentPurchases.length ? (
                <p className="text-sm text-slate-500">Belum ada pembelian.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.recentPurchases.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="py-2 pr-2">
                          <code className="text-xs">{row.docNo}</code>
                          <div className="text-xs text-slate-500">{row.label || row.date}</div>
                        </td>
                        <td className="py-2 text-right font-medium">{formatRp(row.total)}</td>
                        <td className={`py-2 pl-2 text-right text-xs font-semibold ${statusClass(row.status)}`}>
                          {row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </main>
  );
}
