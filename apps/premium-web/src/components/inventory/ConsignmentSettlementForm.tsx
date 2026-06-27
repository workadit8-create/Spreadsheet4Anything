"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { wibTodayIso } from "@/lib/date/wib";
import {
  consignmentActionsClass,
  consignmentFieldGridClass,
  consignmentFormClass,
  consignmentHintClass,
  consignmentSectionClass
} from "@/components/inventory/consignment-layout";

type Supplier = { id: string; name: string };
type Liability = {
  id: string;
  orderNo: string;
  orderDate: string;
  productName: string;
  qty: number;
  unitSettlement: number;
  totalAmount: number;
};
type KasBank = { id: string; name: string };

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

export function ConsignmentSettlementForm({ onSettled }: { onSettled?: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [kasBank, setKasBank] = useState<KasBank[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [settlementDate, setSettlementDate] = useState(() => wibTodayIso());
  const [rekening, setRekening] = useState("");
  const [notes, setNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bootRes, setRes] = await Promise.all([
        fetch("/api/inventory/consignment/bootstrap"),
        fetch(
          supplierId
            ? `/api/inventory/consignment/settlements?supplier_id=${encodeURIComponent(supplierId)}`
            : "/api/inventory/consignment/settlements"
        )
      ]);
      const boot = await bootRes.json();
      const setData = await setRes.json();
      if (!bootRes.ok) throw new Error(boot.error || "Gagal memuat");
      if (!setRes.ok) throw new Error(setData.error || "Gagal memuat hutang");

      setSuppliers(boot.suppliers || []);
      setKasBank(boot.kasBank || []);
      setLiabilities(setData.openLiabilities || []);
      setSelected(new Set());
      if (boot.kasBank?.length === 1 && !rekening) {
        setRekening(boot.kasBank[0].name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [supplierId, rekening]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredLiabilities = useMemo(
    () => liabilities.filter((l) => !supplierId || true),
    [liabilities, supplierId]
  );

  const selectedTotal = useMemo(() => {
    return filteredLiabilities
      .filter((l) => selected.has(l.id))
      .reduce((s, l) => s + l.totalAmount, 0);
  }, [filteredLiabilities, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOpen() {
    setSelected(new Set(filteredLiabilities.map((l) => l.id)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (!supplierId) throw new Error("Supplier wajib");
      if (!rekening) throw new Error("Rekening wajib");
      const ids = selected.size ? [...selected] : filteredLiabilities.map((l) => l.id);
      if (!ids.length) throw new Error("Tidak ada hutang titip terbuka");

      const res = await fetch("/api/inventory/consignment/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId,
          settlement_date: settlementDate,
          rekening,
          notes: notes.trim() || undefined,
          liability_ids: ids
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal settlement");

      setMessage(
        `${data.settlementNo} — ${formatRp(data.total)} (${data.liabilityCount} baris)`
      );
      setNotes("");
      onSettled?.();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal settlement");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-8 text-sm text-slate-500">Memuat…</p>;

  return (
    <form onSubmit={onSubmit} className={consignmentFormClass}>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <p className={consignmentHintClass}>
        Bayar supplier untuk barang titip yang sudah terjual — jurnal Dr Utang Titip Jual / Cr Kas.
      </p>

      <div className={consignmentFieldGridClass}>
        <div>
          <Label>Supplier</Label>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">— pilih —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Tanggal bayar</Label>
          <Input
            type="date"
            value={settlementDate}
            onChange={(e) => setSettlementDate(e.target.value)}
          />
        </div>
        <div>
          <Label>Rekening</Label>
          <Select value={rekening} onChange={(e) => setRekening(e.target.value)} required>
            <option value="">— pilih —</option>
            {kasBank.map((k) => (
              <option key={k.id} value={k.name}>
                {k.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Catatan</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {supplierId ? (
        <div className={consignmentSectionClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-800">Hutang titip terbuka</h3>
            <Button type="button" variant="secondary" onClick={selectAllOpen}>
              Pilih semua
            </Button>
          </div>
          {!filteredLiabilities.length ? (
            <p className="text-sm text-slate-500">Tidak ada hutang titip terbuka.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Pilih</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Produk</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLiabilities.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(l.id)}
                          onChange={() => toggle(l.id)}
                        />
                      </td>
                      <td className="px-4 py-3">{l.orderNo}</td>
                      <td className="px-4 py-3">{l.productName}</td>
                      <td className="px-4 py-3">{l.qty}</td>
                      <td className="px-4 py-3">{formatRp(l.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm font-medium text-slate-700">
            Total dipilih: {formatRp(selected.size ? selectedTotal : filteredLiabilities.reduce((s, l) => s + l.totalAmount, 0))}
            {!selected.size ? " (semua terbuka jika kosong)" : ""}
          </p>
        </div>
      ) : null}

      <div className={consignmentActionsClass}>
        <Button type="submit" disabled={saving || !supplierId}>
          {saving ? "Memproses…" : "Bayar settlement"}
        </Button>
      </div>
    </form>
  );
}
