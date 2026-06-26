"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { wibMonthsAgoIso, wibTodayIso } from "@/lib/date/wib";
import { confirmPostPoJournal, poDebtStatusLabel } from "@/lib/pembelian/po-status-label";
import { PostingRoleBanner } from "@/components/layout/PostingRoleBanner";
import { canPostJournal, type MembershipRole } from "@/lib/org/roles";

type HutangItem = {
  purchaseOrderId: string;
  poNo: string;
  orderDate: string;
  supplierName: string;
  grandTotal: number;
  sisaTagihan: number;
  status: string;
};

type PaymentHistoryItem = {
  id: string;
  amount: number;
  paidAt: string;
  status: string;
  poNo: string;
  supplierName: string;
  keterangan: string;
  voidReason?: string | null;
  postingError?: string | null;
};

type Supplier = { id: string; code: string | null; name: string };
type KasBank = { id: string; name: string; coa_account_name?: string };

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function defaultDateRange() {
  return {
    start: wibMonthsAgoIso(3),
    end: wibTodayIso()
  };
}

export default function HutangPageClient({ role }: { role: MembershipRole }) {
  const canPost = canPostJournal(role);
  const defaults = useMemo(() => defaultDateRange(), []);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [allOutstanding, setAllOutstanding] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<HutangItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [totalHutang, setTotalHutang] = useState(0);
  const [kasBank, setKasBank] = useState<KasBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payTarget, setPayTarget] = useState<HutangItem | null>(null);
  const [payDate, setPayDate] = useState(() => wibTodayIso());
  const [payNominal, setPayNominal] = useState("");
  const [payRekening, setPayRekening] = useState("Kas");
  const [payKeterangan, setPayKeterangan] = useState("");
  const [paying, setPaying] = useState(false);
  const [payMessage, setPayMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [actingPaymentId, setActingPaymentId] = useState<string | null>(null);
  const [actingOrderId, setActingOrderId] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (allOutstanding) {
        params.set("all_outstanding", "true");
      } else {
        params.set("start", start);
        params.set("end", end);
      }
      if (supplierId) params.set("supplier_id", supplierId);
      const res = await fetch(`/api/hutang?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat hutang");
      setItems(data.items || []);
      setTotalHutang(data.totalHutang || 0);
      setSuppliers(data.suppliers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setItems([]);
      setTotalHutang(0);
    } finally {
      setLoading(false);
    }
  }, [start, end, supplierId, allOutstanding]);

  useEffect(() => {
    load();
  }, [load]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/hutang/payments");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat riwayat");
      setHistory(data.items || []);
    } catch (e) {
      setHistory([]);
      setHistoryMessage(e instanceof Error ? e.message : "Gagal memuat riwayat");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    fetch("/api/master/kas-bank")
      .then((r) => r.json())
      .then((data) => {
        const items = data.items || [];
        setKasBank(items);
        const kas = items.find((k: KasBank) => k.name.toLowerCase() === "kas") || items[0];
        if (kas) setPayRekening(kas.name);
      })
      .catch(() => undefined);
  }, []);

  function closePayModal() {
    if (paying) return;
    setPayTarget(null);
    setPayMessage(null);
  }

  function openPay(row: HutangItem) {
    if (row.status !== "POSTED") {
      setListMessage(`Expense ${row.poNo} belum diposting — klik Post jurnal dulu.`);
      return;
    }
    setPayTarget(row);
    setPayDate(wibTodayIso());
    setPayNominal(String(row.sisaTagihan));
    setPayKeterangan("");
    setPayMessage(null);
  }

  async function postOrder(row: HutangItem) {
    if (!confirmPostPoJournal(row.poNo, row.sisaTagihan)) return;
    setActingOrderId(row.purchaseOrderId);
    setListMessage(null);
    try {
      const res = await fetch(`/api/purchase-orders/${row.purchaseOrderId}/post`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setListMessage(data.message || `Expense ${row.poNo} diposting — sekarang bisa dibayar`);
      await load();
    } catch (e) {
      setListMessage(e instanceof Error ? e.message : "Gagal posting");
    } finally {
      setActingOrderId(null);
    }
  }

  async function submitPelunasan() {
    if (!payTarget) return;
    if (!kasBank.length || !payRekening) {
      setPayMessage("Tambah rekening di Master Kas & Bank terlebih dahulu");
      return;
    }
    const nominal = Number(payNominal);
    if (!nominal || nominal <= 0) {
      setPayMessage("Nominal tidak valid");
      return;
    }
    if (nominal > payTarget.sisaTagihan) {
      setPayMessage(`Maksimal ${formatRp(payTarget.sisaTagihan)}`);
      return;
    }

    setPaying(true);
    setPayMessage(null);
    try {
      const res = await fetch("/api/hutang/pelunasan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_order_id: payTarget.purchaseOrderId,
          tanggal: payDate,
          nominal,
          rekening: payRekening,
          keterangan: payKeterangan
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPayMessage(
        `Pelunasan ${payTarget.poNo} disimpan (CONFIRMED). Post jurnal di riwayat pelunasan.`
      );

      setPayTarget(null);
      await load();
      await loadHistory();
    } catch (e) {
      setPayMessage(e instanceof Error ? e.message : "Gagal pelunasan");
    } finally {
      setPaying(false);
    }
  }

  async function postPayment(row: PaymentHistoryItem) {
    setActingPaymentId(row.id);
    setHistoryMessage(null);
    try {
      const res = await fetch(`/api/hutang/payments/${row.id}/post`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistoryMessage(data.message || "Posting OK");
      await load();
      await loadHistory();
    } catch (e) {
      setHistoryMessage(e instanceof Error ? e.message : "Gagal posting");
    } finally {
      setActingPaymentId(null);
    }
  }

  async function voidPayment(row: PaymentHistoryItem) {
    const reason = window.prompt(`Alasan batal pelunasan ${row.poNo}?`, "Input salah");
    if (reason === null) return;

    setActingPaymentId(row.id);
    setHistoryMessage(null);
    try {
      const res = await fetch(`/api/hutang/payments/${row.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistoryMessage(data.message || "Pelunasan dibatalkan");
      await load();
      await loadHistory();
    } catch (e) {
      setHistoryMessage(e instanceof Error ? e.message : "Gagal void");
    } finally {
      setActingPaymentId(null);
    }
  }

  async function deletePayment(row: PaymentHistoryItem) {
    if (!window.confirm(`Hapus pelunasan ${row.poNo}? (belum posting jurnal)`)) return;

    setActingPaymentId(row.id);
    setHistoryMessage(null);
    try {
      const res = await fetch(`/api/hutang/payments/${row.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistoryMessage(data.message || "Pelunasan dihapus");
      await load();
      await loadHistory();
    } catch (e) {
      setHistoryMessage(e instanceof Error ? e.message : "Gagal hapus");
    } finally {
      setActingPaymentId(null);
    }
  }

  function paymentStatusClass(status: string) {
    if (status === "POSTED") return "text-emerald-600";
    if (status === "VOIDED") return "text-red-600";
    if (status === "CONFIRMED") return "text-amber-600";
    return "text-slate-500";
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Hutang"
        title="Daftar hutang"
        description={
          canPost
            ? "Expense kredit / kurang bayar. Post jurnal = catat ke buku besar. Pelunasan (Bayar) dilakukan setelah jurnal expense diposting."
            : "Expense kredit / kurang bayar. Catat pelunasan di sini; posting jurnal dilakukan akuntan atau owner."
        }
      />

      <PostingRoleBanner canPost={canPost} />

      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label>Dari tanggal</Label>
            <Input
              type="date"
              value={start}
              disabled={allOutstanding}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <Label>Sampai tanggal</Label>
            <Input
              type="date"
              value={end}
              disabled={allOutstanding}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div>
            <Label>Supplier</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Semua</option>
              {suppliers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ` : ""}{c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={load}>Cari tagihan</Button>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={allOutstanding}
            onChange={(e) => setAllOutstanding(e.target.checked)}
            className="rounded border-slate-300"
          />
          Tampilkan semua hutang outstanding (tanpa filter tanggal)
        </label>
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3">
          <span className="text-sm text-red-800">Total hutang: </span>
          <strong className="text-lg text-red-900">{formatRp(totalHutang)}</strong>
        </div>
      </Card>

      <Card>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {listMessage && <p className="mb-4 text-sm text-slate-600">{listMessage}</p>}
        {loading ? (
          <p className="text-sm text-slate-500">Memuat hutang...</p>
        ) : !items.length ? (
          <p className="text-sm text-slate-500">
            Tidak ada hutang outstanding{allOutstanding ? "" : " di rentang tanggal ini"}.
            Expense kredit muncul di sini setelah disimpan; pelunasan setelah status POSTED.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Expense</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Sisa</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => {
                  const busy = actingOrderId === row.purchaseOrderId;
                  return (
                  <tr key={row.purchaseOrderId} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">{row.orderDate}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.poNo}</td>
                    <td className="px-4 py-3">{row.supplierName || "—"}</td>
                    <td className="px-4 py-3">{formatRp(row.grandTotal)}</td>
                    <td className="px-4 py-3 font-semibold text-red-700">{formatRp(row.sisaTagihan)}</td>
                    <td className="px-4 py-3">
                      <span className={row.status === "POSTED" ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
                        {poDebtStatusLabel(row.status, row.sisaTagihan)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "CONFIRMED" ? (
                        canPost ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => postOrder(row)}
                        >
                          {busy ? "..." : "Post jurnal"}
                        </Button>
                        ) : (
                          <span className="text-xs text-amber-600">Menunggu posting</span>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => openPay(row)}
                          className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          Bayar
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Riwayat pelunasan</h2>
        <p className="mb-4 text-xs text-slate-500">
          {canPost
            ? "CONFIRMED → Post jurnal · POSTED → Batal (void + jurnal pembalik)"
            : "Pelunasan CONFIRMED menunggu posting jurnal oleh akuntan atau owner."}
        </p>
        {historyMessage && <p className="mb-3 text-sm text-slate-600">{historyMessage}</p>}
        {historyLoading ? (
          <p className="text-sm text-slate-500">Memuat riwayat...</p>
        ) : !history.length ? (
          <p className="text-sm text-slate-500">Belum ada pelunasan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Expense</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Nominal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((row) => {
                  const busy = actingPaymentId === row.id;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        {new Date(row.paidAt).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.poNo}</td>
                      <td className="px-4 py-3">{row.supplierName || "—"}</td>
                      <td className="px-4 py-3">{formatRp(row.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${paymentStatusClass(row.status)}`}>
                          {row.status}
                        </span>
                        {row.postingError && row.status === "CONFIRMED" && (
                          <div className="text-xs text-red-600">{row.postingError}</div>
                        )}
                        {row.voidReason && (
                          <div className="text-xs text-slate-400">{row.voidReason}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.status === "CONFIRMED" && (
                            <>
                              {canPost && (
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => postPayment(row)}
                              >
                                {busy ? "..." : "Post jurnal"}
                              </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => deletePayment(row)}
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
                              onClick={() => voidPayment(row)}
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

      {payTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={closePayModal}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Pelunasan hutang</h3>
            <p className="mt-1 text-sm text-slate-500">
              Expense <strong>{payTarget.poNo}</strong> · {payTarget.supplierName || "—"}
            </p>
            <p className="mt-2 text-sm font-semibold text-red-700">
              Sisa: {formatRp(payTarget.sisaTagihan)}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <Label>Tanggal bayar</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
              <div>
                <Label>Masuk ke rekening</Label>
                {kasBank.length ? (
                  <Select value={payRekening} onChange={(e) => setPayRekening(e.target.value)}>
                    {kasBank.map((k) => (
                      <option key={k.id} value={k.name}>
                        {k.name}{k.coa_account_name ? ` (${k.coa_account_name})` : ""}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="text-sm text-amber-700">
                    Belum ada rekening.{" "}
                    <Link href="/dashboard/master" className="font-medium underline">
                      Tambah di Master Data → Kas & Bank
                    </Link>
                  </p>
                )}
              </div>
              <div>
                <Label>Nominal</Label>
                <Input
                  type="number"
                  min={1}
                  max={payTarget.sisaTagihan}
                  value={payNominal}
                  onChange={(e) => setPayNominal(e.target.value)}
                />
              </div>
              <div>
                <Label>Keterangan</Label>
                <Input
                  value={payKeterangan}
                  onChange={(e) => setPayKeterangan(e.target.value)}
                  placeholder="Opsional"
                />
              </div>
            </div>

            {payMessage && <p className="mt-3 text-sm text-slate-600">{payMessage}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closePayModal} disabled={paying}>
                Batal
              </Button>
              <Button
                type="button"
                onClick={submitPelunasan}
                disabled={paying || !kasBank.length}
              >
                {paying ? "Memproses..." : "Simpan pelunasan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
