"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  addPendingSale,
  getDeviceLabel,
  listPendingSales,
  loadPosCatalog,
  newLocalId,
  removePendingSale,
  savePosCatalog,
  type PosCatalogSnapshot,
  type PosPendingSale
} from "@/lib/pos/offline-store";
import { openPosReceiptPrint } from "@/lib/pos/receipt-print";
import type { OutletOption } from "@/lib/outlets/bootstrap-options";

const POS_OUTLET_STORAGE_KEY = "premium-pos-outlet";

type CartLine = {
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
  note?: string;
  tracks_stock: boolean;
  stock_hint: number | null;
};

type Bootstrap = PosCatalogSnapshot & {
  kasBank: Array<{ id: string; name: string; bankDisplay: string }>;
  outlets?: { enabled: boolean; options: OutletOption[] };
};

function formatRp(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function lineTotal(line: CartLine): number {
  return line.qty * line.unit_price;
}

function formatSyncTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

export default function PosPageClient({ userEmail }: { userEmail: string }) {
  const [catalog, setCatalog] = useState<Bootstrap | null>(null);
  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [bayarInput, setBayarInput] = useState("");
  const [rekening, setRekening] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [noteProductId, setNoteProductId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [weightProductId, setWeightProductId] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState("1");
  const [lastReceipt, setLastReceipt] = useState<PosPendingSale["receipt"] | null>(null);
  const [outletOptions, setOutletOptions] = useState<OutletOption[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState("");
  const [outletsRequired, setOutletsRequired] = useState(false);

  const isFnb = catalog?.businessSectors?.includes("fnb") ?? false;
  const showGramasi = catalog?.businessSectors?.includes("retail") ?? false;

  const refreshPending = useCallback(async () => {
    const pending = await listPendingSales();
    setPendingCount(pending.length);
  }, []);

  const applyBootstrap = useCallback(async (data: Bootstrap) => {
    setCatalog(data);
    setOrgId(data.orgId || "default");
    setRekening(data.defaultKasRekening || data.kasBank[0]?.name || "");
    await savePosCatalog(data.orgId || "default", data);
    await refreshPending();
  }, [refreshPending]);

  const loadBootstrap = useCallback(async (outletCode?: string) => {
    setLoading(true);
    setError("");
    const code = outletCode ?? selectedOutlet;
    try {
      const q = code ? `?outlet_code=${encodeURIComponent(code)}` : "";
      const res = await fetch(`/api/pos/bootstrap${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat kasir");
      const snapshot: Bootstrap = {
        ...data,
        orgId: data.organizationId,
        orgName: data.orgName,
        warehouseId: data.warehouse?.id || null,
        walkInCustomerId: data.walkInCustomerId,
        defaultKasRekening: data.defaultKasRekening,
        businessSectors: data.businessSectors || ["retail"],
        categories: data.categories || [],
        products: data.products || [],
        kasBank: data.kasBank || [],
        tax: data.tax || { active: false },
        syncedAt: data.syncedAt,
        outlets: data.outlets
      };
      if (data.outlets?.enabled && data.outlets.options?.length) {
        setOutletOptions(data.outlets.options);
        setOutletsRequired(true);
        if (!code) {
          setLoading(false);
          return;
        }
      } else {
        setOutletsRequired(false);
      }
      await applyBootstrap(snapshot);
    } catch (e) {
      const cached = await loadPosCatalog(orgId || "default");
      if (cached) {
        setCatalog(cached as Bootstrap);
        setError("Offline — memakai data terakhir");
      } else {
        setError(e instanceof Error ? e.message : "Gagal memuat kasir");
      }
    } finally {
      setLoading(false);
    }
  }, [applyBootstrap, orgId, selectedOutlet]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(POS_OUTLET_STORAGE_KEY) || "";
    if (saved) setSelectedOutlet(saved);
  }, []);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (online && pendingCount > 0) {
      void syncPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const syncPending = async () => {
    if (syncing || !online) return;
    const pending = await listPendingSales();
    if (!pending.length) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/pos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: pending.map((p) => ({
            ...p.payload,
            local_id: p.local_id,
            device_label: p.device_label
          }))
        })
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.results)) {
        for (const r of data.results) {
          if (r.ok) await removePendingSale(r.local_id);
        }
      }
      await refreshPending();
      if (online) await loadBootstrap();
    } finally {
      setSyncing(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!catalog) return [];
    const q = search.trim().toLowerCase();
    return catalog.products.filter((p) => {
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q)
      );
    });
  }, [catalog, categoryId, search]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + lineTotal(line), 0),
    [cart]
  );

  const addToCart = (product: Bootstrap["products"][0], qty = 1, note?: string) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (l) => l.product_id === product.id && (l.note || "") === (note || "")
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          qty,
          unit_price: product.sell_price,
          note,
          tracks_stock: product.effective_tracks_stock,
          stock_hint: product.stock_qty
        }
      ];
    });
  };

  const handleProductClick = (product: Bootstrap["products"][0]) => {
    if (isFnb && product.effective_product_kind === "menu_item") {
      setNoteProductId(product.id);
      setNoteText("");
      return;
    }
    if (showGramasi && product.unit_code === "KG") {
      setWeightProductId(product.id);
      setWeightInput("1");
      return;
    }
    addToCart(product, 1);
  };

  const confirmNoteAdd = () => {
    const product = catalog?.products.find((p) => p.id === noteProductId);
    if (!product) return;
    addToCart(product, 1, noteText.trim() || undefined);
    setNoteProductId(null);
    setNoteText("");
  };

  const confirmWeightAdd = () => {
    const product = catalog?.products.find((p) => p.id === weightProductId);
    if (!product) return;
    const qty = Math.max(0.001, Number(weightInput) || 1);
    addToCart(product, qty);
    setWeightProductId(null);
  };

  const updateQty = (index: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const line = next[index];
      const newQty = Math.max(0.001, line.qty + delta);
      if (newQty <= 0) {
        next.splice(index, 1);
        return next;
      }
      next[index] = { ...line, qty: newQty };
      return next;
    });
  };

  const removeLine = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const openPayment = () => {
    if (!cart.length) return;
    setBayarInput(String(cartTotal));
    setPayOpen(true);
  };

  const completeCheckout = async () => {
    if (!catalog || !cart.length) return;
    setCheckoutLoading(true);
    setError("");

    const localId = newLocalId();
    const deviceLabel = getDeviceLabel();
    const payload = {
      lines: cart.map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        unit_price: l.unit_price,
        note: l.note
      })),
      bayar: paymentMethod === "cash" ? Number(bayarInput) || cartTotal : cartTotal,
      rekening,
      payment_method: paymentMethod,
      warehouse_id: catalog.warehouseId || undefined,
      outlet_code: selectedOutlet || undefined
    };

    const receipt = {
      receiptNo: localId.slice(0, 8).toUpperCase(),
      total: cartTotal,
      change: Math.max(0, (Number(bayarInput) || cartTotal) - cartTotal),
      lines: cart.map((l) => ({
        name: l.name,
        qty: l.qty,
        unit_price: l.unit_price,
        line_total: lineTotal(l),
        note: l.note
      }))
    };

    try {
      if (!online) {
        const pending: PosPendingSale = {
          local_id: localId,
          device_label: deviceLabel,
          created_at: new Date().toISOString(),
          payload,
          receipt: { ...receipt, receiptNo: receipt.receiptNo }
        };
        await addPendingSale(pending);
        await refreshPending();
        openPosReceiptPrint({
          orgName: catalog.orgName,
          receiptNo: receipt.receiptNo,
          dateLabel: new Date().toLocaleString("id-ID"),
          cashierLabel: userEmail,
          lines: receipt.lines,
          subtotal: cartTotal,
          total: cartTotal,
          bayar: Number(bayarInput) || cartTotal,
          change: receipt.change,
          paymentMethod: paymentMethod === "cash" ? "Tunai" : "Transfer",
          offline: true
        });
        setCart([]);
        setPayOpen(false);
        setLastReceipt(receipt);
        return;
      }

      const res = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, local_id: localId, device_label: deviceLabel })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout gagal");

      openPosReceiptPrint({
        orgName: catalog.orgName,
        receiptNo: data.receiptNo || data.orderNo,
        dateLabel: new Date().toLocaleString("id-ID"),
        cashierLabel: userEmail,
        lines: receipt.lines,
        subtotal: cartTotal,
        total: data.total,
        bayar: Number(bayarInput) || cartTotal,
        change: data.change ?? 0,
        paymentMethod: paymentMethod === "cash" ? "Tunai" : "Transfer"
      });

      setCart([]);
      setPayOpen(false);
      setLastReceipt(null);
      await loadBootstrap();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout gagal");
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading && !catalog && !outletsRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        Memuat kasir…
      </div>
    );
  }

  if (outletsRequired && !selectedOutlet) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6">
        <h1 className="text-xl font-semibold text-slate-900">Pilih outlet kasir</h1>
        <p className="max-w-sm text-center text-sm text-slate-600">
          Setiap toko punya kasir & stok sendiri. Pilih outlet sebelum mulai shift.
        </p>
        <div className="grid w-full max-w-md gap-2">
          {outletOptions.map((o) => (
            <button
              key={o.outletCode}
              type="button"
              onClick={() => {
                setSelectedOutlet(o.outletCode);
                localStorage.setItem(POS_OUTLET_STORAGE_KEY, o.outletCode);
                void loadBootstrap(o.outletCode);
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-brand-400"
            >
              <div className="font-semibold text-slate-900">{o.name}</div>
              <div className="text-xs text-slate-500">{o.outletCode}</div>
            </button>
          ))}
        </div>
        <Link href="/dashboard" className="text-sm text-brand-600">
          ← Dashboard
        </Link>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6">
        <p className="text-red-600">{error || "Data kasir tidak tersedia"}</p>
        <Button onClick={() => void loadBootstrap()}>Coba lagi</Button>
        <Link href="/dashboard" className="text-sm text-brand-600">
          ← Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      {/* Status bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-sm">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${
            online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
          {online ? "Online" : "Offline"}
        </span>
        {pendingCount > 0 ? (
          <button
            type="button"
            onClick={() => void syncPending()}
            disabled={!online || syncing}
            className="rounded-full bg-orange-100 px-2.5 py-0.5 font-medium text-orange-800 hover:bg-orange-200 disabled:opacity-50"
          >
            {syncing ? "Sync…" : `${pendingCount} antre`}
          </button>
        ) : null}
        <span className="text-slate-500">
          Stok: {formatSyncTime(catalog.syncedAt)}
          {selectedOutlet ? ` · ${selectedOutlet}` : ""}
        </span>
        {selectedOutlet ? (
          <button
            type="button"
            className="text-xs text-brand-600 hover:underline"
            onClick={() => {
              setSelectedOutlet("");
              setCatalog(null);
              localStorage.removeItem(POS_OUTLET_STORAGE_KEY);
              void loadBootstrap();
            }}
          >
            Ganti outlet
          </button>
        ) : null}
        <span className="ml-auto truncate text-slate-600">{catalog.orgName}</span>
        <Link href="/dashboard" className="text-brand-600 hover:underline">
          Keluar
        </Link>
      </header>

      {error ? (
        <div className="bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Products */}
        <section className="flex min-h-0 flex-1 flex-col border-r border-slate-200 bg-white lg:max-w-[65%]">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <input
              type="search"
              placeholder="Cari produk…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex gap-1 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategoryId("all")}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                  categoryId === "all" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                Semua
              </button>
              {catalog.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    categoryId === c.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void loadBootstrap()}>
                Sync data
              </Button>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProductClick(p)}
                className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-brand-300 hover:bg-white active:scale-[0.98]"
              >
                <span className="line-clamp-2 text-sm font-semibold text-slate-900">{p.name}</span>
                <span className="mt-1 text-sm font-medium text-brand-700">{formatRp(p.sell_price)}</span>
                {p.effective_tracks_stock && p.stock_qty != null ? (
                  <span className="mt-1 text-xs text-slate-500">~{p.stock_qty} {p.unit_code}</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        {/* Cart */}
        <section className="flex w-full flex-col bg-white lg:w-[35%] lg:min-w-[320px]">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900">Keranjang</h2>
            <p className="text-2xl font-bold text-brand-700">{formatRp(cartTotal)}</p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {!cart.length ? (
              <p className="py-8 text-center text-sm text-slate-400">Belum ada item</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((line, idx) => (
                  <li
                    key={`${line.product_id}-${line.note || ""}-${idx}`}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{line.name}</p>
                        {line.note ? (
                          <p className="text-xs text-slate-500">{line.note}</p>
                        ) : null}
                        <p className="text-xs text-slate-500">
                          {formatRp(line.unit_price)} × {line.qty}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">{formatRp(lineTotal(line))}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(idx, -1)}
                        className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-lg"
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center text-sm font-medium">{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(idx, 1)}
                        className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-lg"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="ml-auto text-xs text-red-600 hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 p-3">
            <Button
              className="w-full py-3 text-base"
              disabled={!cart.length}
              onClick={openPayment}
            >
              Bayar
            </Button>
          </div>
        </section>
      </div>

      {/* Payment modal */}
      {payOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Pembayaran</h3>
            <p className="mt-1 text-2xl font-bold text-brand-700">{formatRp(cartTotal)}</p>

            <div className="mt-4 flex gap-2">
              {(["cash", "transfer"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                    paymentMethod === m
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {m === "cash" ? "Tunai" : "Transfer"}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-sm text-slate-600">
              Rekening penerimaan
              <select
                value={rekening}
                onChange={(e) => setRekening(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                {catalog.kasBank.map((k) => (
                  <option key={k.id} value={k.name}>
                    {k.bankDisplay || k.name}
                  </option>
                ))}
              </select>
            </label>

            {paymentMethod === "cash" ? (
              <label className="mt-3 block text-sm text-slate-600">
                Uang diterima
                <input
                  type="number"
                  value={bayarInput}
                  onChange={(e) => setBayarInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                />
                <span className="mt-1 block text-slate-500">
                  Kembalian:{" "}
                  {formatRp(Math.max(0, (Number(bayarInput) || 0) - cartTotal))}
                </span>
              </label>
            ) : null}

            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPayOpen(false)}>
                Batal
              </Button>
              <Button
                className="flex-1"
                disabled={checkoutLoading}
                onClick={() => void completeCheckout()}
              >
                {checkoutLoading ? "Proses…" : "Selesai & struk"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* F&B note modal */}
      {noteProductId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="font-semibold">Catatan pesanan</h3>
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Tanpa es, less sugar…"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setNoteProductId(null)}>
                Batal
              </Button>
              <Button className="flex-1" onClick={confirmNoteAdd}>
                Tambah
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Gramasi modal */}
      {weightProductId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="font-semibold">Berat (kg)</h3>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setWeightProductId(null)}>
                Batal
              </Button>
              <Button className="flex-1" onClick={confirmWeightAdd}>
                Tambah
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
