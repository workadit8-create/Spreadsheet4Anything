"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  DEFAULT_PB_RATE_PERCENT,
  DEFAULT_PPN_RATE_PERCENT,
  type TaxActiveType,
  type TaxSettings
} from "@/lib/org/tax-settings";
import type { MembershipRole } from "@/lib/org/roles";

const TAX_TYPE_OPTIONS: Array<{ value: TaxActiveType; label: string; hint: string }> = [
  {
    value: "none",
    label: "Tidak pakai pajak",
    hint: "Semua transaksi tanpa PPN/PB (default)."
  },
  {
    value: "ppn",
    label: "PPN",
    hint: "Pajak Pertambahan Nilai — untuk usaha PKP."
  },
  {
    value: "pb",
    label: "PB",
    hint: "Pajak Barang — pajak daerah/lokal pada barang tertentu."
  }
];

export default function TaxPageClient({ role }: { role: MembershipRole }) {
  const canEdit = role === "owner";
  const [tax, setTax] = useState<TaxSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org/tax-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setTax(data.tax);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
      setTax(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: {
    activeType?: TaxActiveType;
    ppn?: Partial<TaxSettings["ppn"]>;
    pb?: Partial<TaxSettings["pb"]>;
  }) {
    if (!canEdit || !tax) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/org/tax-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      setTax(data.tax);
      setMessage("Pengaturan pajak disimpan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  const taxActive =
    tax?.activeType === "ppn"
      ? tax.ppn.pkpEnabled
      : tax?.activeType === "pb"
        ? tax.pb.enabled
        : false;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        badge="Core"
        title="Pajak"
        description="Atur jenis pajak usaha — PPN (PKP) atau PB (pajak barang). Default nonaktif."
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
      ) : tax ? (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Jenis pajak aktif</p>
                <p className="mt-1 text-sm text-slate-600">
                  Pilih satu jenis yang dipakai di transaksi dan master produk.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  taxActive
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {tax.activeType === "ppn"
                  ? tax.ppn.pkpEnabled
                    ? "PPN ON"
                    : "PPN (belum PKP)"
                  : tax.activeType === "pb"
                    ? "PB ON"
                    : "OFF"}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {TAX_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    tax.activeType === opt.value
                      ? "border-brand-200 bg-brand-50/50"
                      : "border-slate-100 bg-slate-50/80"
                  } ${!canEdit ? "cursor-default opacity-80" : ""}`}
                >
                  <input
                    type="radio"
                    name="taxType"
                    className="mt-0.5"
                    checked={tax.activeType === opt.value}
                    disabled={saving || !canEdit}
                    onChange={() => void save({ activeType: opt.value })}
                  />
                  <span className="text-sm text-slate-700">
                    <span className="font-medium">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {!canEdit ? (
              <p className="mt-4 text-xs text-slate-500">
                Hanya <strong>owner</strong> yang dapat mengubah pengaturan pajak.
              </p>
            ) : null}
          </Card>

          {tax.activeType === "ppn" ? (
            <Card className="p-5">
              <p className="text-sm font-semibold text-slate-800">Pengaturan PPN</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Tarif PPN</dt>
                  <dd className="font-medium text-slate-900">{DEFAULT_PPN_RATE_PERCENT}%</dd>
                </div>
              </dl>

              {canEdit ? (
                <>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={tax.ppn.pkpEnabled}
                      disabled={saving}
                      onChange={(e) => void save({ ppn: { pkpEnabled: e.target.checked } })}
                    />
                    <span className="text-sm text-slate-700">
                      <span className="font-medium">Usaha sudah PKP</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Centang setelah terdaftar PKP. Master produk menampilkan opsi kena PPN.
                      </span>
                    </span>
                  </label>

                  <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={tax.ppn.priceIncludesTax}
                      disabled={saving || !tax.ppn.pkpEnabled}
                      onChange={(e) =>
                        void save({ ppn: { priceIncludesTax: e.target.checked } })
                      }
                    />
                    <span className="text-sm text-slate-700">
                      <span className="font-medium">Harga produk sudah termasuk PPN</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Jika tidak dicentang, harga = DPP + PPN.
                      </span>
                    </span>
                  </label>
                </>
              ) : null}
            </Card>
          ) : null}

          {tax.activeType === "pb" ? (
            <Card className="p-5">
              <p className="text-sm font-semibold text-slate-800">Pengaturan PB (Pajak Barang)</p>

              {canEdit ? (
                <div className="mt-4 max-w-xs">
                  <Label>Tarif PB (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    disabled={saving}
                    value={tax.pb.ratePercent}
                    onChange={(e) => {
                      const rate = Number(e.target.value);
                      setTax({ ...tax, pb: { ...tax.pb, ratePercent: rate } });
                    }}
                    onBlur={() => void save({ pb: { ratePercent: tax.pb.ratePercent } })}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Default {DEFAULT_PB_RATE_PERCENT}% — sesuaikan dengan ketentuan daerah.
                  </p>
                </div>
              ) : (
                <dl className="mt-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Tarif PB</dt>
                    <dd className="font-medium text-slate-900">{tax.pb.ratePercent}%</dd>
                  </div>
                </dl>
              )}

              {canEdit ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={tax.pb.priceIncludesTax}
                    disabled={saving}
                    onChange={(e) => void save({ pb: { priceIncludesTax: e.target.checked } })}
                  />
                  <span className="text-sm text-slate-700">
                    <span className="font-medium">Harga produk sudah termasuk PB</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Jika tidak dicentang, PB ditambahkan di atas harga jual.
                    </span>
                  </span>
                </label>
              ) : null}
            </Card>
          ) : null}

          <Card className="border-amber-100 bg-amber-50/50 p-5">
            <p className="text-sm font-semibold text-amber-900">Fase berikutnya</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900/90">
              <li>Ringkasan pajak keluaran / masukan per periode</li>
            </ul>
            <p className="mt-3 text-xs text-amber-800/80">
              Invoice dan PO sudah menghitung PPN/PB otomatis sesuai pengaturan di halaman ini.
            </p>
          </Card>

          <p className="text-xs text-slate-500">
            Konsultasikan jenis pajak dan tarif dengan akuntan atau konsultan pajak setempat.
          </p>
        </div>
      ) : null}
    </main>
  );
}
