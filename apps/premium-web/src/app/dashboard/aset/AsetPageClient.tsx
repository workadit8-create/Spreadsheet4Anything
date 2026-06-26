"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { MembershipRole } from "@/lib/org/roles";
import {
  buildAssetLabelsPrintHtml,
  buildSingleAssetLabelPrintHtml,
  openAssetLabelPrintWindow
} from "@/lib/assets/asset-label-print";

type AssetItem = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  assetCoaAccount: string;
  accumulatedDepreciationCoa: string;
  depreciationExpenseCoa: string;
  status: string;
  purchaseOrderId: string | null;
  notes: string | null;
  monthlyDepreciation: number;
  totalDepreciated: number;
  bookValue: number;
  remainingDepreciable: number;
  depreciationLogCount: number;
  disposal: {
    date: string;
    proceeds: number;
    gainLoss: number;
    docNo: string | null;
  } | null;
};

type Bootstrap = {
  categories: string[];
  assetAccounts: string[];
  accumAccounts: string[];
  expenseAccounts: string[];
  kasBank: Array<{ id: string; name: string; coa_account_name: string }>;
  defaults: {
    assetCoaAccount: string;
    accumulatedDepreciationCoa: string;
    depreciationExpenseCoa: string;
    gainOnDisposalCoa?: string;
    lossOnDisposalCoa?: string;
  };
  purchaseOrders: Array<{
    id: string;
    poNo: string;
    orderDate: string;
    total: number;
    status: string;
  }>;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status: string) {
  if (status === "fully_depreciated") return "Sudah penuh disusutkan";
  if (status === "disposed") return "Sudah dispose";
  return "Aktif";
}

export default function AsetPageClient({ role }: { role: MembershipRole }) {
  const canPost = role === "owner" || role === "akuntan";

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [depreciatingId, setDepreciatingId] = useState<string | null>(null);
  const [depPeriod, setDepPeriod] = useState(todayIso());
  const [depAmount, setDepAmount] = useState("");
  const [disposeDate, setDisposeDate] = useState(todayIso());
  const [disposeProceeds, setDisposeProceeds] = useState("");
  const [disposeRekening, setDisposeRekening] = useState("");
  const [disposeNotes, setDisposeNotes] = useState("");
  const [disposingId, setDisposingId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [printingLabels, setPrintingLabels] = useState(false);

  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "Peralatan",
    acquisitionDate: todayIso(),
    acquisitionCost: "",
    salvageValue: "0",
    usefulLifeMonths: "48",
    assetCoaAccount: "",
    accumulatedDepreciationCoa: "",
    depreciationExpenseCoa: "",
    purchaseOrderId: "",
    notes: ""
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetsRes, bootRes, profileRes] = await Promise.all([
        fetch("/api/assets"),
        fetch("/api/assets/bootstrap"),
        fetch("/api/org/business-profile")
      ]);
      const assetsData = await assetsRes.json();
      const bootData = await bootRes.json();
      const profileData = profileRes.ok ? await profileRes.json() : {};
      if (!assetsRes.ok) throw new Error(assetsData.error || "Gagal memuat aset");
      if (!bootRes.ok) throw new Error(bootData.error || "Gagal memuat data pendukung");
      setAssets(assetsData.assets || []);
      setBootstrap(bootData);
      setCompanyName(
        String(profileData.companyName || profileData.orgName || "").trim()
      );
      if (bootData.kasBank?.length) {
        setDisposeRekening(bootData.kasBank[0].name);
      }
      setForm((prev) => ({
        ...prev,
        assetCoaAccount: prev.assetCoaAccount || bootData.defaults?.assetCoaAccount || "",
        accumulatedDepreciationCoa:
          prev.accumulatedDepreciationCoa || bootData.defaults?.accumulatedDepreciationCoa || "",
        depreciationExpenseCoa:
          prev.depreciationExpenseCoa || bootData.defaults?.depreciationExpenseCoa || ""
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAssets = useMemo(
    () => assets.filter((a) => a.status !== "disposed"),
    [assets]
  );

  const totals = useMemo(() => {
    const cost = activeAssets.reduce((s, a) => s + a.acquisitionCost, 0);
    const depreciated = activeAssets.reduce((s, a) => s + a.totalDepreciated, 0);
    const book = activeAssets.reduce((s, a) => s + a.bookValue, 0);
    return { cost, depreciated, book };
  }, [activeAssets]);

  async function submitAsset(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code || null,
          name: form.name,
          category: form.category,
          acquisitionDate: form.acquisitionDate,
          acquisitionCost: Number(form.acquisitionCost),
          salvageValue: Number(form.salvageValue) || 0,
          usefulLifeMonths: Number(form.usefulLifeMonths),
          assetCoaAccount: form.assetCoaAccount,
          accumulatedDepreciationCoa: form.accumulatedDepreciationCoa,
          depreciationExpenseCoa: form.depreciationExpenseCoa,
          purchaseOrderId: form.purchaseOrderId || null,
          notes: form.notes || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      setMessage(`Aset "${data.asset.name}" ditambahkan`);
      setShowForm(false);
      setForm((prev) => ({
        ...prev,
        code: "",
        name: "",
        acquisitionCost: "",
        salvageValue: "0",
        notes: "",
        purchaseOrderId: ""
      }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function recordDepreciation(asset: AssetItem) {
    if (!canPost) return;
    setDepreciatingId(asset.id);
    setMessage(null);
    setError(null);
    try {
      const body: Record<string, unknown> = { periodDate: depPeriod };
      if (depAmount.trim()) body.amount = Number(depAmount);

      const res = await fetch(`/api/assets/${asset.id}/depreciate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencatat penyusutan");
      setMessage(
        `Penyusutan ${formatMoney(data.log.amount)} dicatat (${data.docNo}) — jurnal otomatis`
      );
      setDepAmount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencatat penyusutan");
    } finally {
      setDepreciatingId(null);
    }
  }

  async function recordDisposal(asset: AssetItem) {
    if (!canPost) return;
    setDisposingId(asset.id);
    setMessage(null);
    setError(null);
    try {
      const proceeds = Number(disposeProceeds) || 0;
      const res = await fetch(`/api/assets/${asset.id}/dispose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disposalDate: disposeDate,
          proceeds,
          rekening: proceeds > 0 ? disposeRekening : undefined,
          notes: disposeNotes.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal dispose aset");
      const gl = Number(data.disposal?.gainLoss) || 0;
      const glText =
        gl > 0 ? `laba ${formatMoney(gl)}` : gl < 0 ? `rugi ${formatMoney(-gl)}` : "impas";
      setMessage(`Dispose ${asset.name} (${data.docNo}) — ${glText}, jurnal otomatis`);
      setDisposeProceeds("");
      setDisposeNotes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal dispose aset");
    } finally {
      setDisposingId(null);
    }
  }

  async function printOneLabel(asset: AssetItem) {
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
    }
  }

  async function printAllActiveLabels() {
    const items = activeAssets.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      category: a.category
    }));
    if (!items.length) {
      setError("Tidak ada aset aktif untuk dicetak");
      return;
    }
    setPrintingLabels(true);
    setError(null);
    try {
      const html = await buildAssetLabelsPrintHtml(
        items,
        companyName,
        window.location.origin
      );
      openAssetLabelPrintWindow(html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal cetak label");
    } finally {
      setPrintingLabels(false);
    }
  }

  const selectedDepAsset = assets.find((a) => a.id === depreciatingId);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        badge="Core"
        title="Aset Tetap"
        description="Daftar aset, penyusutan, dispose, dan cetak label QR untuk ditempel di barang fisik."
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Total nilai perolehan</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(totals.cost)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Akumulasi penyusutan</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(totals.depreciated)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Nilai buku</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(totals.book)}</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Tutup form" : "+ Tambah aset"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={printingLabels || activeAssets.length === 0}
          onClick={() => void printAllActiveLabels()}
        >
          {printingLabels ? "Menyiapkan…" : `Cetak label QR (${activeAssets.length})`}
        </Button>
        {!canPost && (
          <span className="text-xs text-zinc-500">
            Penyusutan & dispose: owner / akuntan
          </span>
        )}
      </div>

      {showForm && bootstrap && (
        <Card className="mb-6 p-4">
          <h2 className="mb-3 text-sm font-semibold">Aset baru / saldo awal</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Untuk aset lama yang sudah ada di neraca, cukup daftarkan tanpa jurnal perolehan.
            Opsional tautkan ke expense jika dibeli lewat modul Expense.
          </p>
          <form onSubmit={submitAsset} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Kode (opsional)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="AST-001"
              />
            </div>
            <div>
              <Label>Nama aset *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Kategori</Label>
              <select
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {bootstrap.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Tanggal perolehan *</Label>
              <Input
                type="date"
                value={form.acquisitionDate}
                onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Nilai perolehan (Rp) *</Label>
              <Input
                type="number"
                min={0}
                value={form.acquisitionCost}
                onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Nilai residu (Rp)</Label>
              <Input
                type="number"
                min={0}
                value={form.salvageValue}
                onChange={(e) => setForm({ ...form, salvageValue: e.target.value })}
              />
            </div>
            <div>
              <Label>Umur ekonomis (bulan) *</Label>
              <Input
                type="number"
                min={1}
                value={form.usefulLifeMonths}
                onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Expense terkait (opsional)</Label>
              <select
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                value={form.purchaseOrderId}
                onChange={(e) => setForm({ ...form, purchaseOrderId: e.target.value })}
              >
                <option value="">— tidak ditautkan —</option>
                {bootstrap.purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNo} · {po.orderDate} · {formatMoney(po.total)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Akun aset *</Label>
              <select
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                value={form.assetCoaAccount}
                onChange={(e) => setForm({ ...form, assetCoaAccount: e.target.value })}
                required
              >
                {bootstrap.assetAccounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Akun akumulasi penyusutan *</Label>
              <select
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                value={form.accumulatedDepreciationCoa}
                onChange={(e) =>
                  setForm({ ...form, accumulatedDepreciationCoa: e.target.value })
                }
                required
              >
                {bootstrap.accumAccounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label>Akun beban penyusutan *</Label>
              <select
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                value={form.depreciationExpenseCoa}
                onChange={(e) =>
                  setForm({ ...form, depreciationExpenseCoa: e.target.value })
                }
                required
              >
                {bootstrap.expenseAccounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label>Catatan</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Menyimpan…" : "Simpan aset"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {canPost && (
        <Card className="mb-6 p-4">
          <h2 className="mb-2 text-sm font-semibold">Catat penyusutan</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Pilih aset di tabel, isi periode, lalu klik Catat. Default = penyusutan bulanan
            (garis lurus); tidak melebihi sisa yang belum disusutkan.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Periode (tanggal jurnal)</Label>
              <Input type="date" value={depPeriod} onChange={(e) => setDepPeriod(e.target.value)} />
            </div>
            <div>
              <Label>Jumlah (opsional)</Label>
              <Input
                type="number"
                min={0}
                placeholder="Default bulanan"
                value={depAmount}
                onChange={(e) => setDepAmount(e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      {canPost && (
        <Card className="mb-6 p-4">
          <h2 className="mb-2 text-sm font-semibold">Dispose / jual aset</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Jurnal: Dr Akumulasi + Dr Kas (jika ada penjualan) + Dr Rugi / Cr Aset + Cr Laba.
            Nilai buku = perolehan − akumulasi penyusutan.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Tanggal disposal</Label>
              <Input
                type="date"
                value={disposeDate}
                onChange={(e) => setDisposeDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Hasil penjualan (Rp)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0 = buang/hilang"
                value={disposeProceeds}
                onChange={(e) => setDisposeProceeds(e.target.value)}
              />
            </div>
            {Number(disposeProceeds) > 0 && bootstrap ? (
              <div>
                <Label>Rekening penerimaan</Label>
                <select
                  className="w-full min-w-[140px] rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  value={disposeRekening}
                  onChange={(e) => setDisposeRekening(e.target.value)}
                >
                  {bootstrap.kasBank.map((k) => (
                    <option key={k.id} value={k.name}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="min-w-[200px] flex-1">
              <Label>Catatan (opsional)</Label>
              <Input
                value={disposeNotes}
                onChange={(e) => setDisposeNotes(e.target.value)}
                placeholder="Mis. dijual ke pihak ketiga"
              />
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-zinc-500">Memuat…</p>
        ) : assets.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">
            Belum ada aset. Tambahkan aset lama (saldo awal) atau tautkan dari PO.
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-600">
                <th className="px-3 py-2">Aset</th>
                <th className="px-3 py-2">Perolehan</th>
                <th className="px-3 py-2 text-right">Nilai</th>
                <th className="px-3 py-2 text-right">/bulan</th>
                <th className="px-3 py-2 text-right">Akumulasi</th>
                <th className="px-3 py-2 text-right">Nilai buku</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 w-32">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-zinc-100">
                  <td className="px-3 py-2">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-zinc-500">
                      {[a.code, a.category].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-600">{a.acquisitionDate}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(a.acquisitionCost)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(a.monthlyDepreciation)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(a.totalDepreciated)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatMoney(a.bookValue)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {statusLabel(a.status)}
                    {a.disposal ? (
                      <div className="mt-0.5 text-[10px] text-zinc-400">
                        {a.disposal.date}
                        {a.disposal.proceeds > 0 ? ` · ${formatMoney(a.disposal.proceeds)}` : ""}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        onClick={() => void printOneLabel(a)}
                      >
                        QR
                      </Button>
                      {canPost && a.status === "active" && a.remainingDepreciable > 0 ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          disabled={depreciatingId === a.id || disposingId === a.id}
                          onClick={() => void recordDepreciation(a)}
                        >
                          {depreciatingId === a.id ? "…" : "Susut"}
                        </Button>
                      ) : null}
                      {canPost && a.status !== "disposed" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-2 py-1 text-xs text-red-700"
                          disabled={disposingId === a.id || depreciatingId === a.id}
                          onClick={() => void recordDisposal(a)}
                        >
                          {disposingId === a.id ? "…" : "Dispose"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {selectedDepAsset && depreciatingId && (
        <p className="sr-only">Mencatat penyusutan {selectedDepAsset.name}</p>
      )}
    </main>
  );
}
