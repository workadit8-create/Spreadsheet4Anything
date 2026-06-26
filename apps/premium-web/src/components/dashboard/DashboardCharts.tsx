"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card } from "@/components/ui/Card";
import type { BalanceSlice, MonthlyTrendPoint } from "@/lib/dashboard/chart-data";

const PIE_COLORS = ["#059669", "#0d9488", "#0891b2", "#6366f1", "#8b5cf6", "#d97706", "#e11d48"];

function formatRpShort(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(Math.round(n));
}

function formatRpFull(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

type TooltipPayload = { name?: string; value?: number; color?: string };

function TrendTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-slate-800">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }} className="tabular-nums">
          {entry.name}: {formatRpFull(Number(entry.value) || 0)}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-800">{item.name}</p>
      <p className="tabular-nums text-slate-600">{formatRpFull(Number(item.value) || 0)}</p>
    </div>
  );
}

export function DashboardCharts({
  monthlyTrend,
  balanceMix
}: {
  monthlyTrend: MonthlyTrendPoint[];
  balanceMix: BalanceSlice[];
}) {
  const hasTrend = monthlyTrend.some((p) => p.sales > 0 || p.purchases > 0);
  const hasPie = balanceMix.some((p) => p.value > 0);

  return (
    <div className="mb-8 grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Tren penjualan vs expense</h2>
        <p className="mb-4 text-xs text-slate-500">6 bulan terakhir · transaksi POSTED</p>
        {!hasTrend ? (
          <p className="py-16 text-center text-sm text-slate-500">Belum ada data untuk grafik.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={formatRpShort}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(5, 150, 105, 0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sales" name="Penjualan" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="purchases" name="Expense" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Kas, bank & piutang</h2>
        <p className="mb-4 text-xs text-slate-500">Komposisi likuiditas + piutang</p>
        {!hasPie ? (
          <p className="py-16 text-center text-sm text-slate-500">Belum ada saldo untuk ditampilkan.</p>
        ) : (
          <>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={balanceMix}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                  >
                    {balanceMix.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {balanceMix.map((slice, index) => (
                <li key={slice.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    {slice.name}
                  </span>
                  <span className="font-medium tabular-nums text-slate-800">{formatRpShort(slice.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
