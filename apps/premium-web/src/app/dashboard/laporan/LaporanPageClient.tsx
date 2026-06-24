"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

type JournalLine = {
  id: string;
  line_date: string;
  account_name: string;
  debit: number;
  credit: number;
  keterangan: string | null;
};

type JournalEntry = {
  id: string;
  modul: string;
  transaction_id: string;
  doc_no: string;
  entry_date: string;
  created_at: string;
  lines: JournalLine[];
};

type Props = {
  stats: {
    postedJobs: number;
    failedJobs: number;
    pendingJobs: number;
    journalEntries: number;
    journalLines: number;
    totalOrders: number;
  };
  entries: JournalEntry[];
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);
}

export default function LaporanPageClient({ stats, entries }: Props) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Tahap D"
        title="Laporan & jurnal"
        description="Posting langsung ke Supabase — journal_entries + journal_lines"
      >
        <div className="flex gap-3">
          <Link href="/dashboard/jurnal" className="text-sm text-brand-600 hover:text-brand-700">
            Buka jurnal →
          </Link>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← Dashboard
          </Link>
        </div>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Invoice total" value={stats.totalOrders} />
        <StatCard label="Posting POSTED" value={stats.postedJobs} tone="success" />
        <StatCard label="Posting FAILED" value={stats.failedJobs} tone="danger" />
        <StatCard label="Queue PENDING" value={stats.pendingJobs} />
        <StatCard label="Entri jurnal" value={stats.journalEntries} tone="success" />
        <StatCard label="Baris jurnal" value={stats.journalLines} />
      </div>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Jurnal terbaru</h2>
        {!entries.length ? (
          <p className="text-sm text-slate-500">
            Belum ada jurnal. Buat invoice atau pelunasan piutang untuk generate entri.
          </p>
        ) : (
          <div className="space-y-6">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                  <code className="font-semibold text-slate-800">{entry.doc_no}</code>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600">{entry.modul}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{entry.entry_date}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(entry.created_at).toLocaleString("id-ID")}
                  </span>
                </div>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-slate-500">
                      <th className="px-3 py-2">Akun</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Kredit</th>
                      <th className="px-3 py-2">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line) => (
                      <tr key={line.id} className="hover:bg-slate-50/80">
                        <td className="border-t border-slate-100 px-3 py-1.5">{line.account_name}</td>
                        <td className="border-t border-slate-100 px-3 py-1.5 text-right tabular-nums">
                          {Number(line.debit) > 0 ? formatMoney(Number(line.debit)) : "—"}
                        </td>
                        <td className="border-t border-slate-100 px-3 py-1.5 text-right tabular-nums">
                          {Number(line.credit) > 0 ? formatMoney(Number(line.credit)) : "—"}
                        </td>
                        <td className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
                          {line.keterangan || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
