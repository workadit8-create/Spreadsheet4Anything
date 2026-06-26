"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { ProjectSelect } from "@/components/proyek/ProjectSelect";
import type { ProjectOption } from "@/lib/proyek/bootstrap-options";
import { computePurchaseLineTotal } from "@/lib/posting/purchase-lines";
import { computeLineTax, summarizeLineTax } from "@/lib/tax/compute";
import { wibTodayIso } from "@/lib/date/wib";

type Supplier = { id: string; code: string | null; name: string; pkp?: boolean };
type Category = { id: string; label: string; coa_account: string };
type KasBank = { id: string; name: string };
type PaymentMode = "TUNAI" | "KREDIT" | "PARTIAL";

type LineState = {
  key: string;
  description: string;
  purchase_category_id: string;
  qty: string;
  unit_cost: string;
  diskon: string;
  unit_code: string;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function emptyLine(): LineState {
  return {
    key: `${Date.now()}-${Math.random()}`,
    description: "",
    purchase_category_id: "",
    qty: "1",
    unit_cost: "",
    diskon: "0",
    unit_code: "PCS"
  };
}

export function PembelianForm({ onCreated }: { onCreated?: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kasBank, setKasBank] = useState<KasBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [orderDate, setOrderDate] = useState(() => wibTodayIso());
  const [supplierId, setSupplierId] = useState("");
  const [rekening, setRekening] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("TUNAI");
  const [bayar, setBayar] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [activePrs, setActivePrs] = useState<
    { id: string; prNo: string; supplierName: string; total: number }[]
  >([]);
  const [purchaseRequestId, setPurchaseRequestId] = useState("");
  const [loadingPr, setLoadingPr] = useState(false);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [projectCode, setProjectCode] = useState("");
  const [purchasePpnAvailable, setPurchasePpnAvailable] = useState(false);
  const [purchasePpnSettings, setPurchasePpnSettings] = useState<{
    ratePercent: number;
    priceIncludesTax: boolean;
  } | null>(null);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const supplierPkp = selectedSupplier?.pkp === true;
  const purchaseTaxActive = purchasePpnAvailable && supplierPkp;

  const lineTaxResults = lines.map((line) => {
    const qty = Number(line.qty) || 0;
    const cost = Number(line.unit_cost) || 0;
    const diskon = Number(line.diskon) || 0;
    const netBeforeTax = computePurchaseLineTotal(qty, cost, diskon);
    return computeLineTax(
      netBeforeTax,
      purchaseTaxActive,
      purchasePpnSettings?.ratePercent ?? 0,
      purchasePpnSettings?.priceIncludesTax ?? false,
      purchaseTaxActive ? "ppn" : null
    );
  });

  const lineTotals = lineTaxResults.map((t) => t.gross);
  const taxSummary = summarizeLineTax(lineTaxResults);
  const subtotalDpp = taxSummary.subtotalDpp;
  const taxTotal = taxSummary.taxTotal;
  const grandTotal = taxSummary.grandTotal;
  const bayarNum =
    paymentMode === "TUNAI"
      ? grandTotal
      : paymentMode === "KREDIT"
        ? 0
        : Math.min(grandTotal, Math.max(0, Number(bayar) || 0));
  const kurangBayar = Math.max(0, grandTotal - bayarNum);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pembelian/bootstrap");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data");
      setSuppliers(data.suppliers || []);
      setCategories(data.purchaseCategories || []);
      setKasBank(data.kasBank || []);
      setProjectOptions(data.projectAddon?.options || []);
      setPurchasePpnAvailable(data.purchasePpn?.available === true);
      setPurchasePpnSettings(
        data.purchasePpn?.available
          ? {
              ratePercent: data.purchasePpn.ratePercent,
              priceIncludesTax: data.purchasePpn.priceIncludesTax
            }
          : null
      );
      if (data.kasBank?.length) setRekening(data.kasBank[0].name);
      if (data.purchaseCategories?.length) {
        setLines((prev) =>
          prev.map((l) =>
            l.purchase_category_id ? l : { ...l, purchase_category_id: data.purchaseCategories[0].id }
          )
        );
      }
      const prRes = await fetch("/api/purchase-requests?active=1");
      const prData = await prRes.json();
      if (prRes.ok) setActivePrs(prData.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const catId = categories[0]?.id || "";
    setLines((prev) => [...prev, { ...emptyLine(), purchase_category_id: catId }]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function loadFromPurchaseRequest(id: string) {
    setPurchaseRequestId(id);
    if (!id) return;

    setLoadingPr(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-requests/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setOrderDate(data.purchaseRequest.requestDate);
      if (data.purchaseRequest.supplierId) setSupplierId(data.purchaseRequest.supplierId);
      setProjectCode(data.purchaseRequest.projectCode || "");

      setLines(
        (data.lines || []).map(
          (l: {
            purchaseCategoryId: string | null;
            description: string;
            qty: number;
            unitCost: number;
            diskon: number;
            unitCode: string;
          }) => ({
            key: `${Date.now()}-${Math.random()}`,
            description: l.description,
            purchase_category_id: l.purchaseCategoryId || categories[0]?.id || "",
            qty: String(l.qty),
            unit_cost: String(l.unitCost),
            diskon: String(l.diskon || 0),
            unit_code: l.unitCode || "PCS"
          })
        )
      );
      setMessage(`PR ${data.purchaseRequest.prNo} dimuat. Sesuaikan pembayaran lalu simpan PO.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal muat PR");
      setPurchaseRequestId("");
    } finally {
      setLoadingPr(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setError("Pilih supplier");
      return;
    }
    if (!lines.every((l) => l.description.trim() && l.purchase_category_id)) {
      setError("Lengkapi barang dan kategori di setiap baris");
      return;
    }
    if (grandTotal <= 0) {
      setError("Total harus > 0");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId,
          order_date: orderDate,
          bayar: bayarNum,
          rekening: bayarNum > 0 ? rekening : "",
          purchase_request_id: purchaseRequestId || undefined,
          project_code: projectCode || undefined,
          lines: lines.map((l) => ({
            description: l.description.trim(),
            purchase_category_id: l.purchase_category_id,
            qty: Number(l.qty) || 1,
            unit_cost: Number(l.unit_cost) || 0,
            diskon: Number(l.diskon) || 0,
            unit_code: l.unit_code || "PCS"
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage(data.message || `PO ${data.order?.po_no} disimpan`);
      setLines([{ ...emptyLine(), purchase_category_id: categories[0]?.id || "" }]);
      setBayar("");
      setPurchaseRequestId("");
      setProjectCode("");
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Memuat data master...</p>;

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      {activePrs.length > 0 && (
        <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-4">
          <Label>Muat dari Purchase Request (opsional)</Label>
          <Select
            value={purchaseRequestId}
            onChange={(e) => loadFromPurchaseRequest(e.target.value)}
            disabled={loadingPr}
            className="mt-1"
          >
            <option value="">— PO baru tanpa PR —</option>
            {activePrs.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.prNo} — {pr.supplierName || "Tanpa supplier"} ({formatRp(pr.total)})
              </option>
            ))}
          </Select>
          {loadingPr && <p className="mt-1 text-xs text-slate-500">Memuat PR...</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Tanggal</Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        <div>
          <Label>Supplier</Label>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">Pilih supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.pkp ? " (PKP)" : ""}
              </option>
            ))}
          </Select>
          {supplierId ? (
            <p className="mt-1 text-xs text-slate-500">
              {!purchasePpnAvailable
                ? "PPN masukan belum aktif — centang Usaha sudah PKP di menu Pajak (bagian PPN)."
                : supplierPkp
                  ? "Supplier PKP — PPN masukan dihitung di PO ini."
                  : "Supplier non-PKP (mis. pasar) — tanpa PPN masukan."}
            </p>
          ) : null}
        </div>
      </div>

      <ProjectSelect
        options={projectOptions}
        value={projectCode}
        onChange={setProjectCode}
      />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Barang / jasa</h3>
          <Button type="button" variant="secondary" onClick={addLine}>+ Baris</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Barang / jasa</th>
                <th className="px-3 py-2 w-48">Kategori</th>
                <th className="px-3 py-2 w-20">Qty</th>
                <th className="px-3 py-2 w-32">Harga</th>
                <th className="px-3 py-2 w-28">Diskon</th>
                <th className="px-3 py-2 w-32 text-right">Subtotal</th>
                <th className="px-3 py-2 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, idx) => (
                <tr key={line.key}>
                  <td className="px-3 py-2">
                    <Input
                      placeholder="Nama barang / jasa"
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={line.purchase_category_id}
                      onChange={(e) => updateLine(line.key, { purchase_category_id: e.target.value })}
                    >
                      <option value="">Kategori</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.qty}
                      onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={line.diskon}
                      onChange={(e) => updateLine(line.key, { diskon: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">
                    {formatRp(lineTotals[idx] || 0)}
                  </td>
                  <td className="px-3 py-2">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="text-xs font-medium text-red-500 hover:text-red-600"
                        onClick={() => removeLine(line.key)}
                      >
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 p-4 space-y-2">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Subtotal (DPP)</span>
          <span>{formatRp(subtotalDpp)}</span>
        </div>
        {taxTotal > 0 ? (
          <div className="flex justify-between text-sm text-slate-600">
            <span>PPN masukan ({purchasePpnSettings?.ratePercent}%)</span>
            <span>{formatRp(taxTotal)}</span>
          </div>
        ) : null}
        <p className="text-lg font-semibold border-t border-slate-200 pt-2">
          Total: {formatRp(grandTotal)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["TUNAI", "KREDIT", "PARTIAL"] as PaymentMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaymentMode(mode)}
              className={`rounded-full px-3 py-1 text-sm ${
                paymentMode === mode ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200"
              }`}
            >
              {mode === "TUNAI" ? "Tunai" : mode === "KREDIT" ? "Kredit" : "Sebagian"}
            </button>
          ))}
        </div>
        {paymentMode === "PARTIAL" && (
          <div className="mt-3">
            <Label>Bayar sekarang</Label>
            <Input type="number" min="0" value={bayar} onChange={(e) => setBayar(e.target.value)} />
          </div>
        )}
        {bayarNum > 0 && (
          <div className="mt-3">
            <Label>Rekening</Label>
            <Select value={rekening} onChange={(e) => setRekening(e.target.value)}>
              {kasBank.map((k) => (
                <option key={k.id} value={k.name}>{k.name}</option>
              ))}
            </Select>
          </div>
        )}
        {kurangBayar > 0.01 && (
          <p className="mt-2 text-sm text-amber-700">Sisa hutang: {formatRp(kurangBayar)}</p>
        )}
      </div>

      <Button type="submit" disabled={saving || !suppliers.length || !categories.length}>
        {saving ? "Menyimpan..." : "Simpan pembelian"}
      </Button>
      {!categories.length && (
        <p className="text-xs text-amber-600">Tambah Kategori Pembelian di Master Data terlebih dahulu.</p>
      )}
    </form>
  );
}
