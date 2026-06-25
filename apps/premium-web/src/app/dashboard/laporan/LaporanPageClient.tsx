"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

type ReportTab = "buku-besar" | "laba-rugi" | "neraca" | "arus-kas";

type CoaOption = { code: string; name: string };

type BukuBesarAccount = {
  code: string;
  name: string;
  accountType: string;
  saldoNormal: string;
  saldoAwal: number;
  saldoAkhir: number;
  lines: Array<{
    lineDate: string;
    docNo: string;
    keterangan: string;
    debit: number;
    credit: number;
    saldo: number;
  }>;
};

type LabaRugiSection = {
  title: string;
  lines: Array<{ label: string; amount: number }>;
  subtotal: number;
};

type LabaRugiReport = {
  pendapatan: LabaRugiSection;
  hpp: LabaRugiSection;
  labaKotor: number;
  bebanOperasional: LabaRugiSection;
  labaBersih: number;
};

type NeracaSection = {
  title: string;
  lines: Array<{ label: string; amount: number }>;
  subtotal: number;
};

type NeracaReport = {
  asetLancar: NeracaSection;
  asetTetap: NeracaSection;
  totalAset: number;
  kewajibanLancar: NeracaSection;
  kewajibanJangkaPanjang: NeracaSection;
  totalKewajiban: number;
  ekuitas: NeracaSection;
  labaBerjalan: number;
  totalEkuitas: number;
  totalPassiva: number;
  selisih: number;
};

type ArusKasReport = {
  operasi: Array<{ label: string; hint?: string; amount: number }>;
  arusOperasi: number;
  investasi: Array<{ label: string; hint?: string; amount: number }>;
  arusInvestasi: number;
  pendanaan: Array<{ label: string; hint?: string; amount: number }>;
  arusPendanaan: number;
  kenaikanKas: number;
  kasAwal: number;
  kasAkhir: number;
};

const TABS: { id: ReportTab; label: string }[] = [
  { id: "buku-besar", label: "Buku Besar" },
  { id: "laba-rugi", label: "Laba Rugi" },
  { id: "neraca", label: "Neraca" },
  { id: "arus-kas", label: "Arus Kas" }
];

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function formatNum(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);
}

/** Kolom saldo: nol tetap ditampilkan (bukan strip kosong). */
function formatSaldo(n: number) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);
}

function MoneyCell({ value, bold }: { value: number; bold?: boolean }) {
  const cls = bold ? "font-semibold tabular-nums" : "tabular-nums";
  return <td className={`px-3 py-1.5 text-right ${cls}`}>{formatNum(value)}</td>;
}

function SaldoCell({ value, bold }: { value: number; bold?: boolean }) {
  const cls = bold ? "font-semibold tabular-nums" : "tabular-nums";
  return <td className={`px-3 py-1.5 text-right ${cls}`}>{formatSaldo(value)}</td>;
}

function SectionBlock({
  title,
  section,
  showEmpty
}: {
  title: string;
  section: LabaRugiSection | NeracaSection;
  showEmpty?: boolean;
}) {
  const visible = section.lines.filter((l) => showEmpty || l.amount !== 0);
  if (!visible.length && section.subtotal === 0 && !showEmpty) return null;

  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {visible.map((line) => (
            <tr key={line.label} className="hover:bg-slate-50/80">
              <td className="px-3 py-1.5 pl-6 text-slate-700">{line.label}</td>
              <MoneyCell value={line.amount} />
            </tr>
          ))}
          <tr className="border-t border-slate-200 bg-slate-50">
            <td className="px-3 py-2 font-medium text-slate-800">Jumlah {title}</td>
            <MoneyCell value={section.subtotal} bold />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BukuBesarView({ accounts }: { accounts: BukuBesarAccount[] }) {
  if (!accounts.length) {
    return <p className="text-sm text-slate-500">Tidak ada mutasi jurnal untuk periode ini.</p>;
  }

  return (
    <div className="space-y-8">
      {accounts.map((acc) => (
        <div key={acc.name} className="overflow-hidden rounded-lg border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
            <div className="font-semibold text-slate-900">
              {acc.code ? `${acc.code} — ` : ""}
              {acc.name}
            </div>
            <div className="text-xs text-slate-500">
              {acc.accountType || "—"} · Saldo normal {acc.saldoNormal}
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="bg-blue-50/50">
                <td colSpan={5} className="px-3 py-2 font-medium text-slate-700">
                  Saldo Awal Periode
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatSaldo(acc.saldoAwal)}
                </td>
              </tr>
            </tbody>
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500">
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">No. Bukti</th>
                <th className="px-3 py-2">Keterangan</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Kredit</th>
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {acc.lines.map((line, i) => (
                <tr key={`${line.docNo}-${i}`} className="hover:bg-slate-50/80">
                  <td className="border-t border-slate-100 px-3 py-1.5 text-slate-600">
                    {line.lineDate}
                  </td>
                  <td className="border-t border-slate-100 px-3 py-1.5">
                    <code className="text-xs">{line.docNo}</code>
                  </td>
                  <td className="border-t border-slate-100 px-3 py-1.5 text-slate-600">
                    {line.keterangan || "—"}
                  </td>
                  <MoneyCell value={line.debit} />
                  <MoneyCell value={line.credit} />
                  <SaldoCell value={line.saldo} />
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-blue-50/50">
                <td colSpan={5} className="px-3 py-2 font-medium text-slate-700">
                  Saldo Akhir Periode
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatSaldo(acc.saldoAkhir)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function LabaRugiView({ report }: { report: LabaRugiReport }) {
  return (
    <div>
      <SectionBlock title="Pendapatan Usaha" section={report.pendapatan} />
      <SectionBlock title="Beban Pokok Penjualan (HPP)" section={report.hpp} />
      <div className="mb-4 flex justify-between border-y border-slate-200 bg-emerald-50/60 px-3 py-2 text-sm font-semibold">
        <span>Laba Kotor</span>
        <span className="tabular-nums">{formatNum(report.labaKotor)}</span>
      </div>
      <SectionBlock title="Beban Operasional" section={report.bebanOperasional} />
      <div className="flex justify-between rounded-lg bg-brand-50 px-4 py-3 text-base font-bold text-brand-900">
        <span>Laba Bersih</span>
        <span className="tabular-nums">{formatRp(report.labaBersih)}</span>
      </div>
    </div>
  );
}

function NeracaView({ report }: { report: NeracaReport }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase text-slate-700">Aktiva</h3>
        <SectionBlock title="Aset Lancar" section={report.asetLancar} />
        <SectionBlock title="Aset Tetap" section={report.asetTetap} />
        <div className="flex justify-between border-t-2 border-slate-300 px-3 py-2 font-bold">
          <span>Total Aset</span>
          <span className="tabular-nums">{formatRp(report.totalAset)}</span>
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase text-slate-700">Pasiva</h3>
        <SectionBlock title="Kewajiban Lancar" section={report.kewajibanLancar} />
        <SectionBlock title="Kewajiban Jangka Panjang" section={report.kewajibanJangkaPanjang} />
        <div className="mb-4 flex justify-between border-t border-slate-200 px-3 py-2 font-medium">
          <span>Total Kewajiban</span>
          <span className="tabular-nums">{formatNum(report.totalKewajiban)}</span>
        </div>
        <SectionBlock title="Ekuitas" section={report.ekuitas} />
        <div className="flex justify-between px-3 py-1.5 text-sm">
          <span className="pl-6 text-slate-700">Laba Berjalan (periode)</span>
          <span className="tabular-nums">{formatNum(report.labaBerjalan)}</span>
        </div>
        <div className="mb-4 flex justify-between border-t border-slate-200 px-3 py-2 font-medium">
          <span>Total Ekuitas</span>
          <span className="tabular-nums">{formatNum(report.totalEkuitas)}</span>
        </div>
        <div className="flex justify-between border-t-2 border-slate-300 px-3 py-2 font-bold">
          <span>Total Pasiva</span>
          <span className="tabular-nums">{formatRp(report.totalPassiva)}</span>
        </div>
        {Math.abs(report.selisih) > 0.01 && (
          <p className="mt-2 text-sm text-amber-700">
            Selisih neraca: {formatRp(report.selisih)} — periksa jurnal atau klasifikasi COA.
          </p>
        )}
      </div>
    </div>
  );
}

function ArusKasView({ report }: { report: ArusKasReport }) {
  const block = (
    title: string,
    lines: Array<{ label: string; hint?: string; amount: number }>,
    subtotal: number
  ) => (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {lines.map((line) => (
            <tr key={line.label} className="hover:bg-slate-50/80">
              <td className="px-3 py-1.5">
                <div>{line.label}</div>
                {line.hint && line.hint !== "—" && (
                  <div className="text-xs text-slate-400">{line.hint}</div>
                )}
              </td>
              <MoneyCell value={line.amount} />
            </tr>
          ))}
          <tr className="border-t border-slate-200 bg-slate-50">
            <td className="px-3 py-2 font-medium">Arus Kas Bersih {title.replace("ARUS KAS DARI ", "")}</td>
            <MoneyCell value={subtotal} bold />
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {block("Aktivitas Operasi", report.operasi, report.arusOperasi)}
      {block("Aktivitas Investasi", report.investasi, report.arusInvestasi)}
      {block("Aktivitas Pendanaan", report.pendanaan, report.arusPendanaan)}
      <div className="space-y-2 border-t-2 border-slate-300 pt-4">
        <div className="flex justify-between px-3 font-semibold">
          <span>Kenaikan (Penurunan) Bersih Kas</span>
          <span className="tabular-nums">{formatRp(report.kenaikanKas)}</span>
        </div>
        <div className="flex justify-between px-3 text-sm text-slate-600">
          <span>Kas awal periode</span>
          <span className="tabular-nums">{formatNum(report.kasAwal)}</span>
        </div>
        <div className="flex justify-between rounded-lg bg-brand-50 px-4 py-3 font-bold text-brand-900">
          <span>Kas akhir periode</span>
          <span className="tabular-nums">{formatRp(report.kasAkhir)}</span>
        </div>
      </div>
    </div>
  );
}

export default function LaporanPageClient() {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [tab, setTab] = useState<ReportTab>("buku-besar");
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [account, setAccount] = useState("");
  const [coaOptions, setCoaOptions] = useState<CoaOption[]>([]);
  const [bukuBesar, setBukuBesar] = useState<BukuBesarAccount[]>([]);
  const [labaRugi, setLabaRugi] = useState<LabaRugiReport | null>(null);
  const [neraca, setNeraca] = useState<NeracaReport | null>(null);
  const [arusKas, setArusKas] = useState<ArusKasReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type: tab, start, end });
      if (tab === "buku-besar" && account) params.set("account", account);

      const res = await fetch(`/api/laporan?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat laporan");

      if (tab === "buku-besar") {
        setCoaOptions(json.coaOptions || []);
        setBukuBesar(json.accounts || []);
      } else if (tab === "laba-rugi") {
        setLabaRugi(json.report);
      } else if (tab === "neraca") {
        setNeraca(json.report);
      } else {
        setArusKas(json.report);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat laporan");
    } finally {
      setLoading(false);
    }
  }, [tab, start, end, account]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Laporan"
        title="Laporan akuntansi"
        description="Buku besar, laba rugi, neraca, dan arus kas dari jurnal Supabase"
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

      <Card className="mb-6">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Dari tanggal</Label>
            <Input
              id="laporan-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <Label>Sampai tanggal</Label>
            <Input
              id="laporan-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          {tab === "buku-besar" && (
            <div>
              <Label>Akun (opsional)</Label>
              <Select
                id="laporan-akun"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">Semua akun aktif</option>
                {coaOptions.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.code ? `${c.code} — ` : ""}
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex items-end">
            <Button type="button" onClick={() => void loadReport()} disabled={loading}>
              {loading ? "Memuat…" : "Perbarui"}
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <div className="mb-4 text-sm text-slate-500">
          Periode: <strong className="text-slate-700">{start}</strong> s/d{" "}
          <strong className="text-slate-700">{end}</strong>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Memuat laporan…</p>
        ) : tab === "buku-besar" ? (
          <BukuBesarView accounts={bukuBesar} />
        ) : tab === "laba-rugi" && labaRugi ? (
          <LabaRugiView report={labaRugi} />
        ) : tab === "neraca" && neraca ? (
          <NeracaView report={neraca} />
        ) : tab === "arus-kas" && arusKas ? (
          <ArusKasView report={arusKas} />
        ) : (
          <p className="text-sm text-slate-500">Tidak ada data.</p>
        )}
      </Card>
    </main>
  );
}
