"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

type CoaItem = { id: string; code: string; name: string; account_type: string };

type LineDraft = {
  accountName: string;
  debit: string;
  credit: string;
  keterangan: string;
};

type ManualEntry = {
  id: string;
  doc_no: string;
  entry_date: string;
  transaction_id: string;
  metadata: { keterangan?: string };
  journal_lines: Array<{
    account_name: string;
    debit: number;
    credit: number;
    keterangan: string | null;
    sort_order: number;
  }>;
};

const EMPTY_LINE = (): LineDraft => ({
  accountName: "",
  debit: "",
  credit: "",
  keterangan: ""
});

const SALDO_AWAL_TEMPLATE: LineDraft[] = [
  { accountName: "Kas", debit: "0", credit: "", keterangan: "Saldo awal kas" },
  { accountName: "Bank", debit: "0", credit: "", keterangan: "Saldo awal bank" },
  { accountName: "Piutang Usaha", debit: "0", credit: "", keterangan: "Saldo awal piutang" },
  { accountName: "Utang Usaha", debit: "", credit: "0", keterangan: "Saldo awal utang" },
  { accountName: "Modal Pemilik", debit: "", credit: "0", keterangan: "Penyeimbang ekuitas" }
];

function formatMoney(n: number) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);
}

function parseAmount(s: string): number {
  const n = Number(String(s).replace(/\./g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function JurnalManualPageClient() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [entryDate, setEntryDate] = useState(today);
  const [keterangan, setKeterangan] = useState("Saldo awal / jurnal pembuka");
  const [lines, setLines] = useState<LineDraft[]>([EMPTY_LINE(), EMPTY_LINE()]);
  const [coa, setCoa] = useState<CoaItem[]>([]);
  const [history, setHistory] = useState<ManualEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      debit += parseAmount(line.debit);
      credit += parseAmount(line.credit);
    }
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
  }, [lines]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jurnal/manual");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setCoa(data.coa || []);
      setHistory(data.entries || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addLine() {
    setLines((prev) => [...prev, EMPTY_LINE()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
  }

  function applySaldoAwalTemplate() {
    setKeterangan("Saldo awal pembuka");
    setLines(SALDO_AWAL_TEMPLATE.map((r) => ({ ...r })));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        entryDate,
        keterangan,
        kind: "saldo_awal",
        lines: lines.map((l) => ({
          accountName: l.accountName,
          debit: parseAmount(l.debit),
          credit: parseAmount(l.credit),
          keterangan: l.keterangan || keterangan
        }))
      };

      const res = await fetch("/api/jurnal/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");

      setMessage(`Jurnal ${data.docNo} berhasil diposting.`);
      setLines([EMPTY_LINE(), EMPTY_LINE()]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        badge="Setup"
        title="Jurnal manual"
        description="Untuk saldo awal pembuka — agar neraca balance sebelum transaksi operasional"
      >
        <div className="flex gap-3">
          <Link href="/dashboard/jurnal" className="text-sm text-brand-600 hover:text-brand-700">
            Buka semua jurnal →
          </Link>
          <Link href="/dashboard/laporan" className="text-sm text-slate-500 hover:text-slate-700">
            Laporan
          </Link>
        </div>
      </PageHeader>

      <Card className="mb-6 border-amber-200 bg-amber-50/80">
        <h2 className="mb-2 text-sm font-semibold text-amber-900">Kenapa ini penting?</h2>
        <p className="text-sm text-amber-800/90">
          COA kosong + tanpa transaksi → neraca 0 (technically balance). Begitu ada penjualan/pembelian,
          hanya sisi operasional yang bergerak — <strong>Modal Pemilik</strong> tidak otomatis terisi.
          Input <strong>jurnal saldo awal</strong> (kas, bank, piutang, utang, aset) dengan lawan{" "}
          <strong>Modal Pemilik</strong> / <strong>Laba Ditahan</strong> supaya neraca mencerminkan posisi
          riil perusahaan.
        </p>
      </Card>

      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Buat jurnal baru</h2>
            <p className="text-sm text-slate-500">Total debit harus sama dengan total kredit.</p>
          </div>
          <Button type="button" variant="secondary" onClick={applySaldoAwalTemplate}>
            Template saldo awal
          </Button>
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Tanggal jurnal</Label>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div>
            <Label>Keterangan / no. bukti</Label>
            <Input
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Saldo awal pembuka"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500">
                <th className="px-2 py-2">Akun COA</th>
                <th className="px-2 py-2 text-right">Debit</th>
                <th className="px-2 py-2 text-right">Kredit</th>
                <th className="px-2 py-2">Keterangan baris</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5">
                    <Select
                      value={line.accountName}
                      onChange={(e) => updateLine(i, { accountName: e.target.value })}
                    >
                      <option value="">Pilih akun…</option>
                      {coa.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="text-right tabular-nums"
                      inputMode="numeric"
                      value={line.debit}
                      onChange={(e) => updateLine(i, { debit: e.target.value, credit: "" })}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="text-right tabular-nums"
                      inputMode="numeric"
                      value={line.credit}
                      onChange={(e) => updateLine(i, { credit: e.target.value, debit: "" })}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={line.keterangan}
                      onChange={(e) => updateLine(i, { keterangan: e.target.value })}
                      placeholder={keterangan}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:text-red-700"
                      onClick={() => removeLine(i)}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-medium">
                <td className="px-2 py-2">Total</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMoney(totals.debit)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMoney(totals.credit)}</td>
                <td colSpan={2} className="px-2 py-2">
                  <span className={totals.balanced ? "text-emerald-600" : "text-red-600"}>
                    {totals.balanced ? "Balance ✓" : "Belum balance"}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={addLine}>
            + Baris
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !totals.balanced || loading}
          >
            {saving ? "Menyimpan…" : "Post jurnal"}
          </Button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Riwayat jurnal manual</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat…</p>
        ) : !history.length ? (
          <p className="text-sm text-slate-500">Belum ada jurnal manual.</p>
        ) : (
          <div className="space-y-4">
            {history.map((entry) => {
              const entryLines = [...(entry.journal_lines || [])].sort(
                (a, b) => a.sort_order - b.sort_order
              );
              return (
                <div key={entry.id} className="rounded-lg border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <code className="font-semibold">{entry.doc_no}</code>
                    <span className="mx-2 text-slate-400">·</span>
                    <span>{entry.entry_date}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {entry.metadata?.keterangan || "Jurnal manual"}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {entryLines.map((line, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          <td className="px-3 py-1.5">{line.account_name}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {Number(line.debit) > 0 ? formatMoney(Number(line.debit)) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {Number(line.credit) > 0 ? formatMoney(Number(line.credit)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}
