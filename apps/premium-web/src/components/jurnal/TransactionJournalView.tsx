"use client";

import { useCallback, useEffect, useState } from "react";

type JournalLine = {
  lineDate: string;
  accountName: string;
  debit: number;
  credit: number;
  keterangan: string;
  sortOrder: number;
};

type JournalEntry = {
  id: string;
  modul: string;
  transactionId: string;
  docNo: string;
  entryDate: string;
  entryKind: string;
  sourceDocType: string | null;
  keterangan: string;
  lines: JournalLine[];
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);
}

export function TransactionJournalView({
  sourceType,
  sourceId,
  active
}: {
  sourceType: string;
  sourceId: string;
  active: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sourceId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ source_type: sourceType, source_id: sourceId });
      const res = await fetch(`/api/jurnal/by-source?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat jurnal");
      setEntries(data.entries || []);
      setHint(data.hint || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat jurnal");
      setEntries([]);
      setHint(null);
    } finally {
      setLoading(false);
    }
  }, [sourceType, sourceId]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  if (!active) return null;

  if (loading) {
    return <p className="py-8 text-center text-sm text-slate-500">Memuat jurnal...</p>;
  }

  if (error) {
    return <p className="py-6 text-center text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-4">
      {hint && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {hint}
        </p>
      )}

      {!entries.length ? (
        <p className="py-6 text-center text-sm text-slate-500">Tidak ada entri jurnal.</p>
      ) : (
        entries.map((entry) => {
          const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
          const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
          const isReversal = entry.entryKind === "VOID_REVERSAL";

          return (
            <div key={entry.id} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <code className="font-semibold text-slate-800">{entry.docNo}</code>
                <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                  {entry.modul}
                </span>
                <span className="text-xs text-slate-500">{entry.entryDate}</span>
                {isReversal && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                    PEMBALIKAN
                  </span>
                )}
                {entry.keterangan && (
                  <span className="text-xs text-slate-400">{entry.keterangan}</span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50/50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Akun</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Kredit</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">
                        <div>{line.accountName}</div>
                        {line.keterangan && (
                          <div className="text-xs text-slate-400">{line.keterangan}</div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {line.debit > 0 ? formatMoney(line.debit) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {line.credit > 0 ? formatMoney(line.credit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50/80 font-semibold">
                    <td className="px-3 py-2 text-right text-slate-600">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totalDebit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}

export function DetailModalTabs({
  tab,
  onTabChange,
  showJournal
}: {
  tab: "detail" | "jurnal";
  onTabChange: (tab: "detail" | "jurnal") => void;
  showJournal: boolean;
}) {
  return (
    <div className="mb-4 flex gap-2 border-b border-slate-100 pb-3">
      <button
        type="button"
        onClick={() => onTabChange("detail")}
        className={`rounded-full px-3 py-1 text-sm font-medium ${
          tab === "detail"
            ? "bg-brand-600 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        Detail transaksi
      </button>
      {showJournal && (
        <button
          type="button"
          onClick={() => onTabChange("jurnal")}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            tab === "jurnal"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Lihat jurnal
        </button>
      )}
    </div>
  );
}
