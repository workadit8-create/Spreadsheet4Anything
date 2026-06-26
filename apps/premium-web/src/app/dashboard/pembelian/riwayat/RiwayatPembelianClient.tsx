"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { wibMonthStartIso, wibTodayIso } from "@/lib/date/wib";
import { confirmPostPoJournal, poDebtStatusLabel } from "@/lib/pembelian/po-status-label";
import { buildPoPrintHtml, openPoPrintWindow, type PoPrintCompany } from "@/lib/pembelian/po-print";
import { DetailModalTabs, TransactionJournalView } from "@/components/jurnal/TransactionJournalView";
import { PostingRoleBanner } from "@/components/layout/PostingRoleBanner";
import { canPostJournal, type MembershipRole } from "@/lib/org/roles";

type HistoryRow = {
  id: string;
  poNo: string;
  orderDate: string;
  supplierName: string;
  status: string;
  grandTotal: number;
  bayar: number;
  sisaTagihan: number;
};

type Supplier = { id: string; name: string };

type DetailLine = {
  id: string;
  description: string;
  qty: number;
  unitCost: number;
  diskon: number;
  lineTotal: number;
  metode: string;
  akunPembelian: string;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function defaultDateRange() {
  return { start: wibMonthStartIso(), end: wibTodayIso() };
}

function statusClass(status: string) {
  if (status === "POSTED") return "text-emerald-600";
  if (status === "VOIDED") return "text-red-600";
  if (status === "CONFIRMED") return "text-amber-600";
  return "text-slate-500";
}

export default function RiwayatPembelianClient({ role }: { role: MembershipRole }) {
  const canPost = canPostJournal(role);
  const defaults = useMemo(() => defaultDateRange(), []);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [grandTotalSum, setGrandTotalSum] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"detail" | "jurnal">("detail");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOrder, setDetailOrder] = useState<HistoryRow | null>(null);
  const [detailLines, setDetailLines] = useState<DetailLine[]>([]);
  const [detailCompany, setDetailCompany] = useState<PoPrintCompany>({ name: "", logoUrl: null });

  useEffect(() => {
    fetch("/api/master/suppliers")
      .then((r) => r.json())
      .then((data) => setSuppliers((data.items || []).map((s: Supplier) => ({ id: s.id, name: s.name }))))
      .catch(() => setSuppliers([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      if (supplierId) params.set("supplier_id", supplierId);
      const res = await fetch(`/api/purchase-orders?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows(data.rows || []);
      setGrandTotalSum(Number(data.grandTotalSum) || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat riwayat");
      setRows([]);
      setGrandTotalSum(0);
    } finally {
      setLoading(false);
    }
  }, [start, end, supplierId]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(row: HistoryRow) {
    setDetailOpen(true);
    setDetailTab("detail");
    setDetailOrder(row);
    setDetailLoading(true);
    setDetailLines([]);
    try {
      const res = await fetch(`/api/purchase-orders/${row.id}/detail`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetailLines(data.lines || []);
      setDetailCompany(data.company || { name: "", logoUrl: null });
      if (data.order) {
        setDetailOrder({
          id: row.id,
          poNo: data.order.poNo,
          orderDate: data.order.orderDate,
          supplierName: data.order.supplierName,
          status: data.order.status,
          grandTotal: data.order.grandTotal,
          bayar: data.order.bayar,
          sisaTagihan: data.order.sisaTagihan
        });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memuat detail");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function postOrder(id: string, poNo: string, sisaTagihan = 0) {
    if (!confirmPostPoJournal(poNo, sisaTagihan)) return;
    setActingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/purchase-orders/${id}/post`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || `Expense ${poNo} diposting`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal posting");
    } finally {
      setActingId(null);
    }
  }

  async function voidOrder(id: string, poNo: string) {
    const reason = window.prompt(`Alasan batal expense ${poNo}?`, "Input salah");
    if (reason === null) return;
    setActingId(id);
    try {
      const res = await fetch(`/api/purchase-orders/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Expense dibatalkan");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal void");
    } finally {
      setActingId(null);
    }
  }

  async function deleteOrder(id: string, poNo: string) {
    if (!window.confirm(`Hapus expense ${poNo}? (belum posting)`)) return;
    setActingId(id);
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Expense dihapus");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal hapus");
    } finally {
      setActingId(null);
    }
  }

  async function exportData(type: "produk" | "supplier") {
    setExporting(type);
    setMessage(null);
    try {
      const params = new URLSearchParams({ start, end, type });
      if (supplierId) params.set("supplier_id", supplierId);
      const res = await fetch(`/api/pembelian/export?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export gagal");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ||
        `pembelian_${type}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal export");
    } finally {
      setExporting(null);
    }
  }

  function printDetail() {
    if (!detailOrder || detailLoading) return;
    try {
      const html = buildPoPrintHtml(
        {
          order: {
            poNo: detailOrder.poNo,
            orderDate: detailOrder.orderDate,
            supplierName: detailOrder.supplierName,
            status: detailOrder.status,
            grandTotal: detailOrder.grandTotal,
            bayar: detailOrder.bayar,
            sisaTagihan: detailOrder.sisaTagihan
          },
          lines: detailLines.map((l) => ({
            description: l.description,
            qty: l.qty,
            unitCost: l.unitCost,
            diskon: l.diskon,
            lineTotal: l.lineTotal
          }))
        },
        detailCompany
      );
      openPoPrintWindow(html);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal cetak expense");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader badge="Expense" title="Riwayat Expense" description="Filter, detail, cetak, export, post jurnal, void">
        <Link href="/dashboard/pembelian" className="text-sm text-slate-500 hover:text-slate-700">← Expense</Link>
      </PageHeader>

      <PostingRoleBanner canPost={canPost} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label>Dari tanggal</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>Sampai tanggal</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="min-w-[200px]">
            <Label>Supplier</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Semua supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={load} disabled={loading}>Cari data</Button>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm font-medium text-sky-800">Total (sesuai filter, tidak termasuk dibatalkan)</p>
          <p className="text-2xl font-bold text-sky-950">{formatRp(grandTotalSum)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={exporting !== null}
            onClick={() => exportData("supplier")}
          >
            {exporting === "supplier" ? "..." : "Export per supplier"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={exporting !== null}
            onClick={() => exportData("produk")}
          >
            {exporting === "produk" ? "..." : "Export per barang"}
          </Button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-3 text-sm text-slate-600">{message}</p>}

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : !rows.length ? (
          <p className="py-10 text-center text-sm text-slate-500">Tidak ada data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500">
                  <th className="border-b px-2 py-2">Tanggal</th>
                  <th className="border-b px-2 py-2">No. Expense</th>
                  <th className="border-b px-2 py-2">Supplier</th>
                  <th className="border-b px-2 py-2">Total</th>
                  <th className="border-b px-2 py-2">Sisa hutang</th>
                  <th className="border-b px-2 py-2">Status</th>
                  <th className="border-b px-2 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const busy = actingId === row.id;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="border-b border-slate-100 px-2 py-2">{row.orderDate}</td>
                      <td className="border-b border-slate-100 px-2 py-2"><code className="text-xs">{row.poNo}</code></td>
                      <td className="border-b border-slate-100 px-2 py-2">{row.supplierName || "—"}</td>
                      <td className="border-b border-slate-100 px-2 py-2">{formatRp(row.grandTotal)}</td>
                      <td className="border-b border-slate-100 px-2 py-2">{formatRp(row.sisaTagihan)}</td>
                      <td className="border-b border-slate-100 px-2 py-2">
                        <span className={`font-semibold ${statusClass(row.status)}`}>
                          {poDebtStatusLabel(row.status, row.sisaTagihan)}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" variant="ghost" onClick={() => openDetail(row)}>Detail</Button>
                          {row.status === "CONFIRMED" && (
                            <>
                              {canPost && (
                                <Button type="button" variant="secondary" disabled={busy} onClick={() => postOrder(row.id, row.poNo, row.sisaTagihan)}>Post jurnal</Button>
                              )}
                              <Button type="button" variant="ghost" disabled={busy} onClick={() => deleteOrder(row.id, row.poNo)}>Hapus</Button>
                            </>
                          )}
                          {row.status === "POSTED" && canPost && (
                            <Button type="button" variant="secondary" disabled={busy} onClick={() => voidOrder(row.id, row.poNo)}>Batal</Button>
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

      {detailOpen && detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetailOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <DetailModalTabs
              tab={detailTab}
              onTabChange={setDetailTab}
              showJournal={detailOrder.status === "POSTED" || detailOrder.status === "VOIDED"}
            />

            {detailTab === "detail" ? (
              <>
            <h3 className="text-lg font-semibold">Detail expense: {detailOrder.poNo}</h3>
            <p className="text-sm text-slate-500">{detailOrder.supplierName} · {detailOrder.orderDate}</p>
            {detailLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Memuat...</p>
            ) : (
              <>
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="bg-emerald-800 text-left text-white">
                      <th className="px-2 py-2">Barang</th>
                      <th className="px-2 py-2 text-center">Qty</th>
                      <th className="px-2 py-2 text-right">Harga</th>
                      <th className="px-2 py-2 text-right">Diskon</th>
                      <th className="px-2 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLines.map((l) => (
                      <tr key={l.id} className="border-b">
                        <td className="px-2 py-2">{l.description}</td>
                        <td className="px-2 py-2 text-center">{l.qty}</td>
                        <td className="px-2 py-2 text-right">{formatRp(l.unitCost)}</td>
                        <td className="px-2 py-2 text-right">{formatRp(l.diskon)}</td>
                        <td className="px-2 py-2 text-right font-semibold">{formatRp(l.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-right font-bold">Grand Total</td>
                      <td className="px-2 py-3 text-right text-lg font-bold text-brand-600">
                        {formatRp(detailOrder.grandTotal)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-2 py-1 text-right text-slate-600">Sudah dibayar</td>
                      <td className="px-2 py-1 text-right">{formatRp(detailOrder.bayar)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-2 py-1 text-right text-slate-600">Sisa hutang</td>
                      <td className="px-2 py-1 text-right font-semibold text-red-700">
                        {formatRp(detailOrder.sisaTagihan)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button type="button" onClick={printDetail} disabled={!detailLines.length}>
                    Cetak expense
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setDetailOpen(false)}>Tutup</Button>
                </div>
              </>
            )}
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">
                  Jurnal expense: <span className="text-brand-600">{detailOrder.poNo}</span>
                </h3>
                <p className="mb-3 text-sm text-slate-500">{detailOrder.orderDate}</p>
                <TransactionJournalView
                  sourceType="PURCHASE_ORDER"
                  sourceId={detailOrder.id}
                  active={detailTab === "jurnal"}
                />
                <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setDetailOpen(false)}>Tutup</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
