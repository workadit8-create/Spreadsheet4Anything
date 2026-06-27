"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { HistoryDetail } from "@/lib/penjualan/history";
import {
  buildInvoicePrintHtml,
  openInvoicePrintWindow,
  type InvoicePrintCustomer
} from "@/lib/penjualan/invoice-print";
import type { OrgPrintSettings } from "@/lib/org/print-settings";
import { wibMonthStartIso, wibTodayIso } from "@/lib/date/wib";
import { confirmPostInvoiceJournal, invoiceDebtStatusLabel } from "@/lib/penjualan/invoice-status-label";
import { DetailModalTabs, TransactionJournalView } from "@/components/jurnal/TransactionJournalView";
import { PostingRoleBanner } from "@/components/layout/PostingRoleBanner";
import { canPostJournal, type MembershipRole } from "@/lib/org/roles";

type HistoryRow = {
  id: string;
  orderNo: string;
  orderDate: string;
  customerName: string;
  status: string;
  grandTotal: number;
  bayar: number;
  sisaTagihan: number;
};

type Customer = { id: string; name: string };

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function defaultDateRange() {
  return {
    start: wibMonthStartIso(),
    end: wibTodayIso()
  };
}

function orderStatusClass(status: string) {
  if (status === "POSTED") return "text-emerald-600";
  if (status === "VOIDED") return "text-red-600";
  if (status === "CONFIRMED") return "text-amber-600";
  return "text-slate-500";
}

export default function RiwayatPenjualanClient({ role }: { role: MembershipRole }) {
  const canPost = canPostJournal(role);
  const defaults = useMemo(() => defaultDateRange(), []);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [outletCode, setOutletCode] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Customer[]>([]);
  const [outlets, setOutlets] = useState<Array<{ code: string; label: string }>>([]);
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
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [company, setCompany] = useState({ name: "", address: "", phone: "", logoUrl: null as string | null });
  const [printCustomer, setPrintCustomer] = useState<InvoicePrintCustomer | null>(null);
  const [printSettings, setPrintSettings] = useState<OrgPrintSettings | null>(null);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/master/customers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCustomers((data.items || data.customers || []).map((c: Customer) => ({ id: c.id, name: c.name })));
    } catch {
      setCustomers([]);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/master/suppliers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuppliers((data.items || data.suppliers || []).map((s: Customer) => ({ id: s.id, name: s.name })));
    } catch {
      setSuppliers([]);
    }
  }, []);

  const loadOutlets = useCallback(async () => {
    try {
      const res = await fetch("/api/master/outlets");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOutlets(
        (data.items || data.outlets || []).map((o: { code: string; name?: string; label?: string }) => ({
          code: o.code,
          label: o.label || o.name || o.code
        }))
      );
    } catch {
      setOutlets([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      if (customerId) params.set("customer_id", customerId);
      if (supplierId) params.set("supplier_id", supplierId);
      if (outletCode) params.set("outlet_code", outletCode);
      const res = await fetch(`/api/penjualan/history?${params}`);
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
  }, [start, end, customerId, supplierId, outletCode]);

  useEffect(() => {
    loadCustomers();
    loadSuppliers();
    loadOutlets();
  }, [loadCustomers, loadSuppliers, loadOutlets]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(orderId: string) {
    setDetailOpen(true);
    setDetailTab("detail");
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/penjualan/history/${orderId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetail(data.detail);
      setCompany(data.company || { name: "", address: "", phone: "", logoUrl: null });
      setPrintCustomer(data.customer || null);
      setPrintSettings(data.print || null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memuat detail");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetail(null);
  }

  function printDetail() {
    if (!detail) return;
    const html = buildInvoicePrintHtml(detail, company, printCustomer, printSettings || undefined);
    openInvoicePrintWindow(html);
  }

  async function postOrder(orderId: string, orderNo: string, sisaTagihan = 0) {
    if (!confirmPostInvoiceJournal(orderNo, sisaTagihan)) return;
    setActingId(orderId);
    setMessage(null);
    try {
      const res = await fetch(`/api/sales-orders/${orderId}/post`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || `Invoice ${orderNo} diposting`);
      await load();
      if (detail?.order.id === orderId) await openDetail(orderId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal posting");
    } finally {
      setActingId(null);
    }
  }

  async function voidOrder(orderId: string, orderNo: string) {
    const reason = window.prompt(`Alasan batal invoice ${orderNo}?`, "Input salah");
    if (reason === null) return;

    setActingId(orderId);
    setMessage(null);
    try {
      const res = await fetch(`/api/sales-orders/${orderId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || `Invoice ${orderNo} dibatalkan`);
      await load();
      if (detail?.order.id === orderId) await openDetail(orderId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal void");
    } finally {
      setActingId(null);
    }
  }

  async function deleteOrder(orderId: string, orderNo: string) {
    if (!window.confirm(`Hapus invoice ${orderNo}? (belum posting jurnal)`)) return;

    setActingId(orderId);
    setMessage(null);
    try {
      const res = await fetch(`/api/sales-orders/${orderId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message || "Invoice dihapus");
      closeDetail();
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal hapus");
    } finally {
      setActingId(null);
    }
  }

  async function exportData(type: "produk" | "kategori" | "hpp") {
    setExporting(type);
    setMessage(null);
    try {
      const params = new URLSearchParams({ start, end, type });
      if (customerId) params.set("customer_id", customerId);
      if (supplierId) params.set("supplier_id", supplierId);
      if (outletCode) params.set("outlet_code", outletCode);
      const res = await fetch(`/api/penjualan/export?${params}`);
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
        `penjualan_${type}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal export");
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        badge="Penjualan"
        title="Riwayat Invoice"
        description="Filter transaksi, detail, cetak, export, dan posting jurnal"
      >
        <Link href="/dashboard/penjualan" className="text-sm text-slate-500 hover:text-slate-700">
          ← Penjualan
        </Link>
      </PageHeader>

      <PostingRoleBanner canPost={canPost} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label>Dari tanggal</Label>
            <Input id="hist-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>Sampai tanggal</Label>
            <Input id="hist-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="min-w-[200px]">
            <Label>Customer</Label>
            <Select
              id="hist-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Semua customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="min-w-[200px]">
            <Label>Supplier titip</Label>
            <Select
              id="hist-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Semua supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          {outlets.length ? (
            <div className="min-w-[160px]">
              <Label>Outlet</Label>
              <Select
                id="hist-outlet"
                value={outletCode}
                onChange={(e) => setOutletCode(e.target.value)}
              >
                <option value="">Semua outlet</option>
                {outlets.map((o) => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </Select>
            </div>
          ) : null}
          <Button type="button" onClick={() => load()} disabled={loading}>
            {loading ? "Memuat..." : "Cari data"}
          </Button>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm font-medium text-sky-800">Total keseluruhan (sesuai filter)</p>
          <p className="text-2xl font-bold text-sky-950">{formatRp(grandTotalSum)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={exporting !== null}
            onClick={() => exportData("kategori")}
          >
            {exporting === "kategori" ? "..." : "Export per kategori"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={exporting !== null}
            onClick={() => exportData("hpp")}
          >
            {exporting === "hpp" ? "..." : "Export per HPP"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={exporting !== null}
            onClick={() => exportData("produk")}
          >
            {exporting === "produk" ? "..." : "Export rincian produk"}
          </Button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-3 text-sm text-slate-600">{message}</p>}

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat riwayat...</p>
        ) : !rows.length ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Pencarian kosong. Tidak ada transaksi yang sesuai.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500">
                  <th className="border-b border-slate-200 px-2 py-2">Tanggal</th>
                  <th className="border-b border-slate-200 px-2 py-2">No Invoice</th>
                  <th className="border-b border-slate-200 px-2 py-2">Customer</th>
                  <th className="border-b border-slate-200 px-2 py-2">Grand Total</th>
                  <th className="border-b border-slate-200 px-2 py-2">Sisa Tagihan</th>
                  <th className="border-b border-slate-200 px-2 py-2">Status</th>
                  <th className="border-b border-slate-200 px-2 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const busy = actingId === row.id;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="border-b border-slate-100 px-2 py-2">{row.orderDate}</td>
                      <td className="border-b border-slate-100 px-2 py-2">
                        <code className="text-xs">{row.orderNo}</code>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2">{row.customerName || "—"}</td>
                      <td className="border-b border-slate-100 px-2 py-2">{formatRp(row.grandTotal)}</td>
                      <td className="border-b border-slate-100 px-2 py-2">{formatRp(row.sisaTagihan)}</td>
                      <td className="border-b border-slate-100 px-2 py-2">
                        <span className={`font-semibold ${orderStatusClass(row.status)}`}>
                          {invoiceDebtStatusLabel(row.status, row.sisaTagihan)}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" variant="ghost" onClick={() => openDetail(row.id)}>
                            Detail
                          </Button>
                          {row.status === "CONFIRMED" && (
                            <>
                              {canPost && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => postOrder(row.id, row.orderNo, row.sisaTagihan)}
                                >
                                  {busy ? "..." : "Post jurnal"}
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => deleteOrder(row.id, row.orderNo)}
                              >
                                Hapus
                              </Button>
                            </>
                          )}
                          {row.status === "POSTED" && canPost && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => voidOrder(row.id, row.orderNo)}
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

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={closeDetail}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading || !detail ? (
              <p className="py-10 text-center text-sm text-slate-500">Memuat detail...</p>
            ) : (
              <>
                <DetailModalTabs
                  tab={detailTab}
                  onTabChange={setDetailTab}
                  showJournal={detail.order.status === "POSTED" || detail.order.status === "VOIDED"}
                />

                {detailTab === "detail" ? (
                  <>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Detail Invoice:{" "}
                      <span className="text-brand-600">{detail.order.orderNo}</span>
                    </h3>
                    <p className="text-sm text-slate-500">
                      Customer: {detail.order.customerName || "—"} · {detail.order.orderDate}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-600"
                    onClick={closeDetail}
                  >
                    ✕
                  </button>
                </div>

                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-emerald-800 text-left text-white">
                      <th className="px-3 py-2">Produk</th>
                      <th className="px-3 py-2 text-center">Qty</th>
                      <th className="px-3 py-2 text-right">Harga</th>
                      <th className="px-3 py-2 text-right">Diskon</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.id} className="border-b border-slate-100">
                        <td className="px-3 py-2">{line.productName}</td>
                        <td className="px-3 py-2 text-center">{line.qty}</td>
                        <td className="px-3 py-2 text-right">{formatRp(line.unitPrice)}</td>
                        <td className="px-3 py-2 text-right">{formatRp(line.diskon)}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {formatRp(line.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-right font-bold">Grand Total</td>
                      <td className="px-3 py-3 text-right text-lg font-bold text-brand-600">
                        {formatRp(detail.order.grandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  {detail.order.status === "POSTED" || detail.order.status === "VOIDED" ? (
                    <span className="self-center text-sm text-red-500">
                      {detail.order.status === "VOIDED" ? "Invoice dibatalkan" : "Sudah diposting"}
                    </span>
                  ) : (
                    <>
                      {canPost && (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={actingId === detail.order.id}
                          onClick={() => postOrder(detail.order.id, detail.order.orderNo, detail.order.sisaTagihan)}
                        >
                          Post jurnal
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={actingId === detail.order.id}
                        onClick={() => deleteOrder(detail.order.id, detail.order.orderNo)}
                      >
                        Hapus
                      </Button>
                    </>
                  )}
                  {detail.order.status === "POSTED" && canPost && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={actingId === detail.order.id}
                      onClick={() => voidOrder(detail.order.id, detail.order.orderNo)}
                    >
                      Batal
                    </Button>
                  )}
                  <Button type="button" onClick={printDetail}>Cetak invoice</Button>
                  <Button type="button" variant="ghost" onClick={closeDetail}>Tutup</Button>
                </div>
                  </>
                ) : (
                  <>
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          Jurnal Invoice:{" "}
                          <span className="text-brand-600">{detail.order.orderNo}</span>
                        </h3>
                        <p className="text-sm text-slate-500">{detail.order.orderDate}</p>
                      </div>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-600"
                        onClick={closeDetail}
                      >
                        ✕
                      </button>
                    </div>
                    <TransactionJournalView
                      sourceType="SALES_ORDER"
                      sourceId={detail.order.id}
                      active={detailTab === "jurnal"}
                    />
                    <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                      <Button type="button" variant="ghost" onClick={closeDetail}>Tutup</Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
