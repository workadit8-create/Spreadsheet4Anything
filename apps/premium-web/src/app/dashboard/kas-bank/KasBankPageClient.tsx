"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";

type KasAccount = { id: string; name: string; coa_account_name: string };
type CoaAccount = { id: string; code: string; name: string; account_type: string };

type MutasiItem = {
  id: string;
  transferNo: string;
  transferDate: string;
  kind: string;
  sourceAccountName: string;
  destAccountName: string;
  amount: number;
  keterangan: string;
  status: string;
  linked?: boolean;
  openingBalance?: boolean;
};

type OpeningAccount = {
  id: string;
  name: string;
  coa_account_name: string;
  saldoMutasi: number;
};

type MutasiKind = "Transfer" | "Masuk" | "Keluar";

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function statusLabel(status: string, linked?: boolean, openingBalance?: boolean): string {
  if (status === "CONFIRMED") return "Belum jurnal";
  if (status === "POSTED") {
    if (openingBalance) return "Saldo awal";
    return linked ? "Tercatat" : "Jurnal OK";
  }
  if (status === "VOIDED") return "Dibatalkan";
  return status;
}

function statusClass(status: string): string {
  if (status === "POSTED") return "text-emerald-600";
  if (status === "VOIDED") return "text-red-600";
  if (status === "CONFIRMED") return "text-amber-600";
  return "text-slate-500";
}

function detailText(row: MutasiItem): string {
  if (row.kind === "Transfer") {
    return `${row.sourceAccountName || "—"} → ${row.destAccountName || "—"}`;
  }
  if (row.kind === "Masuk") {
    return `Setoran ke ${row.destAccountName || "—"}`;
  }
  return `Penarikan dari ${row.sourceAccountName || "—"}`;
}

export default function KasBankPageClient() {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [accounts, setAccounts] = useState<KasAccount[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [saldo, setSaldo] = useState<Record<string, number>>({});
  const [items, setItems] = useState<MutasiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [kind, setKind] = useState<MutasiKind>("Transfer");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [contraCoa, setContraCoa] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");

  const [openingAccounts, setOpeningAccounts] = useState<OpeningAccount[]>([]);
  const [journalByCoa, setJournalByCoa] = useState<Record<string, number>>({});
  const [allocatedByCoa, setAllocatedByCoa] = useState<Record<string, number>>({});
  const [openingAmounts, setOpeningAmounts] = useState<Record<string, string>>({});
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [openingSaving, setOpeningSaving] = useState(false);

  const loadOpening = useCallback(async () => {
    try {
      const res = await fetch("/api/kas-bank/opening-saldo");
      const data = await res.json();
      if (!res.ok) return;
      setOpeningAccounts(data.accounts || []);
      setJournalByCoa(data.journalByCoa || {});
      setAllocatedByCoa(data.allocatedByCoa || {});
    } catch {
      /* optional panel */
    }
  }, []);

  const needsOpeningAllocation = useMemo(() => {
    return Object.entries(journalByCoa).some(([coa, journalBal]) => {
      if (journalBal <= 0) return false;
      return (allocatedByCoa[coa] || 0) < journalBal - 0.01;
    });
  }, [journalByCoa, allocatedByCoa]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/kas-bank/mutasi?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setItems(data.items || []);
      setSaldo(data.saldo || {});
      setAccounts(data.accounts || []);
      setCoaAccounts(data.coaAccounts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    load();
    void loadOpening();
  }, [load, loadOpening]);

  function resetForm() {
    setTransferDate(new Date().toISOString().slice(0, 10));
    setSourceId("");
    setDestId("");
    setContraCoa("");
    setNominal("");
    setKeterangan("");
  }

  async function submitMutasi(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/kas-bank/mutasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_date: transferDate,
          kind,
          source_account_id: sourceId || null,
          dest_account_id: destId || null,
          contra_coa_name: contraCoa || undefined,
          amount: Number(nominal),
          keterangan
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Mutasi disimpan");
      resetForm();
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  async function postMutasi(row: MutasiItem) {
    if (
      !window.confirm(
        `Posting jurnal mutasi ${row.transferNo}?\n\nPosting = catat transaksi ke buku besar.\n\nLanjutkan?`
      )
    ) {
      return;
    }
    setActingId(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/kas-bank/mutasi/${row.id}/post`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Posting OK");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal posting");
    } finally {
      setActingId(null);
    }
  }

  async function voidMutasi(row: MutasiItem) {
    const reason = window.prompt(`Alasan batal mutasi ${row.transferNo}?`, "Input salah");
    if (reason === null) return;
    setActingId(row.id);
    try {
      const res = await fetch(`/api/kas-bank/mutasi/${row.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Mutasi dibatalkan");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal void");
    } finally {
      setActingId(null);
    }
  }

  async function deleteMutasi(row: MutasiItem) {
    if (!window.confirm(`Hapus mutasi ${row.transferNo}? (belum posting jurnal)`)) return;
    setActingId(row.id);
    try {
      const res = await fetch(`/api/kas-bank/mutasi/${row.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Mutasi dihapus");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal hapus");
    } finally {
      setActingId(null);
    }
  }

  async function submitOpeningSaldo(e: React.FormEvent) {
    e.preventDefault();
    setOpeningSaving(true);
    setMessage(null);
    setError(null);
    try {
      const allocations = openingAccounts
        .map((a) => ({
          accountId: a.id,
          amount: Number(String(openingAmounts[a.id] || "").replace(/\./g, "")) || 0
        }))
        .filter((r) => r.amount > 0);

      const res = await fetch("/api/kas-bank/opening-saldo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferDate: openingDate, allocations })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal alokasi");
      setMessage(`Saldo awal rekening tercatat (${data.inserted} baris).`);
      setOpeningAmounts({});
      await load();
      await loadOpening();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal alokasi");
    } finally {
      setOpeningSaving(false);
    }
  }

  const showSource = kind === "Transfer" || kind === "Keluar";
  const showDest = kind === "Transfer" || kind === "Masuk";
  const showContra = kind === "Masuk" || kind === "Keluar";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        badge="Kas & Bank"
        title="Mutasi dana"
        description="Saldo & riwayat dari mutasi (manual + otomatis dari pembelian/penjualan/pelunasan). Post jurnal MUTASI_DANA hanya untuk mutasi manual."
      >
        <Link href="/dashboard/master" className="text-sm text-slate-500 hover:text-slate-700">
          Master Kas & Bank →
        </Link>
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {accounts.length ? (
          accounts.map((a) => (
            <Card key={a.id} className="border-sky-200 bg-sky-50/60 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-sky-700">{a.name}</p>
              <p className="mt-1 text-lg font-bold text-sky-950">{formatRp(saldo[a.name] || 0)}</p>
              <p className="text-[11px] text-sky-600">{a.coa_account_name}</p>
            </Card>
          ))
        ) : (
          <Card className="col-span-full py-4">
            <p className="text-sm text-slate-500">
              Belum ada rekening.{" "}
              <Link href="/dashboard/master" className="font-medium text-brand-600 underline">
                Tambah di Master Data → Kas & Bank
              </Link>
            </p>
          </Card>
        )}
      </div>

      {needsOpeningAllocation && openingAccounts.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/80">
          <h2 className="mb-1 text-base font-semibold text-amber-950">Alokasi saldo awal rekening</h2>
          <p className="mb-4 text-sm text-amber-900/90">
            Neraca sudah balance via <strong>Jurnal Manual</strong> (COA Kas/Bank). Langkah ini membagi saldo ke
            rekening master (KAS KECIL, BANK BCA, …) <strong>tanpa jurnal tambahan</strong> — supaya kartu saldo
            di atas benar sebelum transaksi.
          </p>
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            {Object.entries(journalByCoa).map(([coa, bal]) =>
              bal > 0 ? (
                <div key={coa} className="rounded-lg bg-white/80 px-3 py-2 ring-1 ring-amber-200">
                  <span className="font-medium text-slate-800">{coa}</span>
                  <span className="text-slate-500"> jurnal: </span>
                  <span className="font-semibold tabular-nums">{formatRp(bal)}</span>
                  <span className="text-slate-500"> · dialokasi: </span>
                  <span className="font-semibold tabular-nums">{formatRp(allocatedByCoa[coa] || 0)}</span>
                </div>
              ) : null
            )}
          </div>
          <form onSubmit={submitOpeningSaldo}>
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {openingAccounts.map((a) => (
                <div key={a.id}>
                  <Label>{a.name}</Label>
                  <p className="mb-1 text-[11px] text-slate-500">{a.coa_account_name}</p>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={openingAmounts[a.id] || ""}
                    onChange={(e) =>
                      setOpeningAmounts((prev) => ({ ...prev, [a.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>Tanggal saldo awal</Label>
                <Input
                  type="date"
                  value={openingDate}
                  onChange={(e) => setOpeningDate(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={openingSaving}>
                {openingSaving ? "Menyimpan…" : "Simpan alokasi saldo awal"}
              </Button>
              <Link href="/dashboard/jurnal/manual" className="text-sm text-brand-700 hover:underline">
                Jurnal Manual →
              </Link>
            </div>
          </form>
          <p className="mt-3 text-xs text-amber-800">
            Contoh: Kas jurnal 25 jt → KAS KECIL 25 jt. Bank jurnal 150 jt → BANK BCA 100 jt + BANK MANDIRI 50 jt.
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Input mutasi</h2>
          <form onSubmit={submitMutasi} className="space-y-3">
            <div>
              <Label>Tanggal</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} required />
            </div>
            <div>
              <Label>Jenis</Label>
              <Select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as MutasiKind);
                  setSourceId("");
                  setDestId("");
                  setContraCoa("");
                }}
              >
                <option value="Transfer">Transfer antar rekening</option>
                <option value="Masuk">Setoran (masuk)</option>
                <option value="Keluar">Penarikan (keluar)</option>
              </Select>
            </div>
            {showSource && (
              <div>
                <Label>{kind === "Transfer" ? "Dari rekening" : "Dari rekening"}</Label>
                <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)} required={showSource}>
                  <option value="">— Pilih —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </div>
            )}
            {showDest && (
              <div>
                <Label>{kind === "Transfer" ? "Ke rekening" : "Ke rekening"}</Label>
                <Select value={destId} onChange={(e) => setDestId(e.target.value)} required={showDest}>
                  <option value="">— Pilih —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </div>
            )}
            {showContra && (
              <div>
                <Label>Akun lawan (opsional)</Label>
                <Select value={contraCoa} onChange={(e) => setContraCoa(e.target.value)}>
                  <option value="">
                    {kind === "Masuk" ? "Default: Mutasi Masuk" : "Default: Mutasi Keluar"}
                  </option>
                  {coaAccounts.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label>Nominal</Label>
              <Input
                type="number"
                min={1}
                required
                value={nominal}
                onChange={(e) => setNominal(e.target.value)}
              />
            </div>
            <div>
              <Label>Keterangan</Label>
              <Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Opsional" />
            </div>
            <Button type="submit" disabled={saving || !accounts.length} className="w-full">
              {saving ? "Menyimpan..." : "Simpan mutasi"}
            </Button>
          </form>
        </Card>

        <div>
          <Card className="mb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label>Dari tanggal</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label>Sampai tanggal</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <Button type="button" variant="secondary" onClick={load} disabled={loading}>
                Cari
              </Button>
            </div>
          </Card>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {message && <p className="mb-3 text-sm text-slate-600">{message}</p>}

          <Card>
            <h2 className="mb-4 text-base font-semibold text-slate-900">Riwayat mutasi</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Memuat...</p>
            ) : !items.length ? (
              <p className="text-sm text-slate-500">Belum ada mutasi di rentang tanggal ini.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Tanggal</th>
                      <th className="px-3 py-2">No</th>
                      <th className="px-3 py-2">Jenis</th>
                      <th className="px-3 py-2">Detail</th>
                      <th className="px-3 py-2">Nominal</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((row) => {
                      const busy = actingId === row.id;
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2">{row.transferDate}</td>
                          <td className="px-3 py-2 font-mono text-xs">{row.transferNo}</td>
                          <td className="px-3 py-2">{row.kind}</td>
                          <td className="px-3 py-2">{detailText(row)}</td>
                          <td className="px-3 py-2 font-semibold">{formatRp(row.amount)}</td>
                          <td className="px-3 py-2">
                            <span className={`font-semibold ${statusClass(row.status)}`}>
                              {statusLabel(row.status, row.linked, row.openingBalance)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {row.status === "CONFIRMED" && !row.linked && (
                                <>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={busy}
                                    onClick={() => postMutasi(row)}
                                  >
                                    {busy ? "..." : "Post jurnal"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => deleteMutasi(row)}
                                  >
                                    Hapus
                                  </Button>
                                </>
                              )}
                              {row.status === "POSTED" && !row.linked && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => voidMutasi(row)}
                                >
                                  {busy ? "..." : "Batal"}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
