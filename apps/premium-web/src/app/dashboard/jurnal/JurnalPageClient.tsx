"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

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
  source_doc_type: string | null;
  created_at: string;
  lines: JournalLine[];
};

type Props = {
  entries: JournalEntry[];
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);
}

export default function JurnalPageClient({ entries }: Props) {
  const totalDebit = entries.reduce(
    (sum, e) => sum + e.lines.reduce((s, l) => s + Number(l.debit), 0),
    0
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        badge="Jurnal umum"
        title="Jurnal Supabase"
        description="Penjualan, pembelian, pelunasan, mutasi kas/bank, dan jurnal manual"
      >
        <div className="flex gap-3">
          <Link href="/dashboard/jurnal/manual" className="text-sm text-brand-600 hover:text-brand-700">
            + Jurnal manual →
          </Link>
          <Link href="/dashboard/laporan" className="text-sm text-slate-500 hover:text-slate-700">
            Laporan
          </Link>
        </div>
      </PageHeader>

      <Card className="mb-6">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{entries.length}</span> entri jurnal
          ditampilkan (max 50). Total debit baris:{" "}
          <span className="font-semibold tabular-nums">{formatMoney(totalDebit)}</span>
        </p>
      </Card>

      {!entries.length ? (
        <Card>
          <p className="text-sm text-slate-500">Belum ada jurnal. Posting transaksi (penjualan, pembelian, pelunasan, mutasi).</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <Card key={entry.id} className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <code className="font-semibold text-slate-800">{entry.doc_no}</code>
                <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                  {entry.modul}
                </span>
                {entry.source_doc_type && (
                  <span className="text-xs text-slate-400">{entry.source_doc_type}</span>
                )}
                <span className="text-slate-500">{entry.entry_date}</span>
                <code className="ml-auto text-[10px] text-slate-400">{entry.transaction_id}</code>
              </div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2">Tanggal</th>
                    <th className="px-4 py-2">Akun</th>
                    <th className="px-4 py-2 text-right">Debit</th>
                    <th className="px-4 py-2 text-right">Kredit</th>
                    <th className="px-4 py-2">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50/80">
                      <td className="border-t border-slate-100 px-4 py-1.5 text-xs text-slate-500">
                        {line.line_date}
                      </td>
                      <td className="border-t border-slate-100 px-4 py-1.5 font-medium text-slate-800">
                        {line.account_name}
                      </td>
                      <td className="border-t border-slate-100 px-4 py-1.5 text-right tabular-nums">
                        {Number(line.debit) > 0 ? formatMoney(Number(line.debit)) : "—"}
                      </td>
                      <td className="border-t border-slate-100 px-4 py-1.5 text-right tabular-nums">
                        {Number(line.credit) > 0 ? formatMoney(Number(line.credit)) : "—"}
                      </td>
                      <td className="border-t border-slate-100 px-4 py-1.5 text-xs text-slate-500">
                        {line.keterangan || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
