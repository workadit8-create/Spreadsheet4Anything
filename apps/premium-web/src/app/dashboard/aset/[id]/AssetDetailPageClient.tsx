"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  buildSingleAssetLabelPrintHtml,
  openAssetLabelPrintWindow
} from "@/lib/assets/asset-label-print";

type AssetDetail = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  status: string;
  notes: string | null;
  bookValue: number;
  totalDepreciated: number;
  monthlyDepreciation: number;
  depreciationCount: number;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function statusLabel(status: string) {
  if (status === "fully_depreciated") return "Sudah penuh disusutkan";
  if (status === "disposed") return "Sudah dispose";
  return "Aktif";
}

export default function AssetDetailPageClient({
  asset,
  companyName
}: {
  asset: AssetDetail;
  companyName: string;
}) {
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function printLabel() {
    setPrinting(true);
    setError(null);
    try {
      const html = await buildSingleAssetLabelPrintHtml(
        {
          id: asset.id,
          code: asset.code,
          name: asset.name,
          category: asset.category
        },
        companyName,
        window.location.origin
      );
      openAssetLabelPrintWindow(html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal cetak label");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        badge="Aset"
        title={asset.name}
        description={asset.code ? `Kode ${asset.code}` : "Detail aset tetap"}
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <Card className="mb-4 space-y-3 p-4 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500">Kategori</span>
          <span className="font-medium">{asset.category}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500">Status</span>
          <span>{statusLabel(asset.status)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500">Tanggal perolehan</span>
          <span>{asset.acquisitionDate}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500">Nilai perolehan</span>
          <span className="tabular-nums">{formatMoney(asset.acquisitionCost)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500">Akumulasi penyusutan</span>
          <span className="tabular-nums">{formatMoney(asset.totalDepreciated)}</span>
        </div>
        <div className="flex justify-between gap-2 border-t border-zinc-100 pt-2">
          <span className="font-medium text-zinc-700">Nilai buku</span>
          <span className="font-semibold tabular-nums">{formatMoney(asset.bookValue)}</span>
        </div>
        {asset.notes ? (
          <p className="border-t border-zinc-100 pt-2 text-xs text-zinc-500">{asset.notes}</p>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void printLabel()} disabled={printing}>
          {printing ? "Menyiapkan…" : "Cetak label QR"}
        </Button>
        <Link href="/dashboard/aset">
          <Button type="button" variant="secondary">
            ← Daftar aset
          </Button>
        </Link>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        QR pada label mengarah ke halaman ini — scan untuk cek identitas aset di lapangan.
      </p>
    </main>
  );
}
