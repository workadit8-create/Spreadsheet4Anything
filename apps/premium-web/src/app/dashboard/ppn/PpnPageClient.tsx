"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { DEFAULT_PPN_RATE_PERCENT, type PpnSettings } from "@/lib/org/ppn-settings";
import type { MembershipRole } from "@/lib/org/roles";

export default function PpnPageClient({ role }: { role: MembershipRole }) {
  const canEdit = role === "owner";
  const [ppn, setPpn] = useState<PpnSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org/ppn-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setPpn(data.ppn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
      setPpn(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<Pick<PpnSettings, "pkpEnabled" | "priceIncludesPpn">>) {
    if (!canEdit || !ppn) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/org/ppn-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pkpEnabled: patch.pkpEnabled ?? ppn.pkpEnabled,
          priceIncludesPpn: patch.priceIncludesPpn ?? ppn.priceIncludesPpn
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      setPpn(data.ppn);
      setMessage("Pengaturan PPN disimpan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        badge="Core"
        title="PPN"
        description="Pajak Pertambahan Nilai — fitur inti, default nonaktif sampai usaha PKP."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Memuat…</p>
      ) : ppn ? (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Status PKP</p>
                <p className="mt-1 text-sm text-slate-600">
                  {ppn.pkpEnabled
                    ? "Aktif — usaha terdaftar PKP (PPN akan dipakai di transaksi)."
                    : "Nonaktif — belum PKP atau belum melapor PPN."}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  ppn.pkpEnabled
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {ppn.pkpEnabled ? "PKP ON" : "OFF"}
              </span>
            </div>

            {canEdit ? (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={ppn.pkpEnabled}
                  disabled={saving}
                  onChange={(e) => void save({ pkpEnabled: e.target.checked })}
                />
                <span className="text-sm text-slate-700">
                  <span className="font-medium">Usaha sudah PKP</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Centang hanya setelah terdaftar PKP dan siap melapor PPN. Default semua akun
                    nonaktif.
                  </span>
                </span>
              </label>
            ) : (
              <p className="mt-4 text-xs text-slate-500">
                Hanya <strong>owner</strong> yang dapat mengubah status PKP.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold text-slate-800">Tarif &amp; harga</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Tarif PPN</dt>
                <dd className="font-medium text-slate-900">{DEFAULT_PPN_RATE_PERCENT}%</dd>
              </div>
            </dl>

            {canEdit ? (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={ppn.priceIncludesPpn}
                  disabled={saving || !ppn.pkpEnabled}
                  onChange={(e) => void save({ priceIncludesPpn: e.target.checked })}
                />
                <span className="text-sm text-slate-700">
                  <span className="font-medium">Harga produk sudah termasuk PPN</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Jika tidak dicentang, harga = DPP + PPN (umum untuk B2B).
                  </span>
                </span>
              </label>
            ) : null}
          </Card>

          <Card className="border-amber-100 bg-amber-50/50 p-5">
            <p className="text-sm font-semibold text-amber-900">Fase berikutnya</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900/90">
              <li>Centang produk kena PPN di Master → Produk</li>
              <li>PPN otomatis di invoice &amp; PO saat PKP aktif</li>
              <li>Ringkasan PPN keluaran / masukan per periode</li>
            </ul>
            <p className="mt-3 text-xs text-amber-800/80">
              Saat ini menu ini hanya pengaturan — transaksi belum menghitung PPN.
            </p>
          </Card>

          <p className="text-xs text-slate-500">
            Atur produk di{" "}
            <Link href="/dashboard/master" className="font-medium text-brand-600 hover:underline">
              Master Data
            </Link>
            . Konsultasikan status PKP dengan akuntan atau konsultan pajak.
          </p>
        </div>
      ) : null}
    </main>
  );
}
