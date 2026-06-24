import type { HybridBackendConfig } from "@/lib/hybrid/config";
import type { SalesLineMetadata, SalesOrderMetadata, SalesOrderRow, SalesLineRow } from "./types";
import { callHybridBackend } from "./pemasukan";

export type SyncSheetLine = {
  produk: string;
  qty: number;
  satuan: string;
  harga: number;
  diskon: number;
  total: number;
  bayar: number;
  kurangBayar: number;
  status: string;
  transactionId: string;
  akunPendapatan: string;
};

export type SyncSheetPayload = {
  apiKey: string;
  spreadsheetId: string;
  action: "SYNC_PREMIUM_PEMASUKAN";
  invoice: string;
  tanggalPesan: string;
  keterangan: string;
  total: number;
  bayar: number;
  status: string;
  tanggalBayar: string;
  akunPendapatan: string;
  rekening: string;
  transactionId: string;
  alreadyPosted: boolean;
  customer: string;
  source: string;
  lines?: SyncSheetLine[];
};

function asLineMeta(raw: unknown): SalesLineMetadata {
  const m = (raw || {}) as Record<string, unknown>;
  return {
    transactionId: String(m.transactionId || ""),
    akunPendapatan: m.akunPendapatan ? String(m.akunPendapatan) : undefined,
    diskon: Number(m.diskon) || 0,
    unitCode: m.unitCode ? String(m.unitCode) : undefined,
    bayar: m.bayar != null ? Number(m.bayar) : undefined,
    kurangBayar: m.kurangBayar != null ? Number(m.kurangBayar) : undefined,
    paymentStatus: m.paymentStatus as SalesLineMetadata["paymentStatus"]
  };
}

export function buildSyncSheetPayload(
  order: SalesOrderRow,
  meta: SalesOrderMetadata,
  config: HybridBackendConfig,
  lines?: SalesLineRow[]
): SyncSheetPayload {
  const customer = meta.customerName || "Premium Web";
  const base: SyncSheetPayload = {
    apiKey: config.apiKey,
    spreadsheetId: config.spreadsheetId,
    action: "SYNC_PREMIUM_PEMASUKAN",
    invoice: order.order_no,
    tanggalPesan: order.order_date,
    keterangan: meta.keterangan || order.order_no,
    total: Number(order.total),
    bayar: Number(meta.bayar) || 0,
    status: meta.paymentStatus,
    tanggalBayar: meta.tanggalBayar || order.order_date,
    akunPendapatan: meta.akunPendapatan || "Pendapatan",
    rekening: String(meta.rekening || ""),
    transactionId: meta.transactionId,
    alreadyPosted: true,
    customer,
    source: "PREMIUM_WEB"
  };

  if (lines && lines.length > 0 && lines.some((l) => l.product_id)) {
    base.lines = lines.map((line) => {
      const lm = asLineMeta(line.metadata);
      const kurang =
        lm.kurangBayar != null
          ? lm.kurangBayar
          : Math.max(0, Number(line.line_total) - (lm.bayar || 0));
      const bayar = lm.bayar != null ? lm.bayar : Number(line.line_total) - kurang;
      return {
        produk: line.description,
        qty: Number(line.qty),
        satuan: lm.unitCode || "PCS",
        harga: Number(line.unit_price),
        diskon: lm.diskon || 0,
        total: Number(line.line_total),
        bayar,
        kurangBayar: kurang,
        status: lm.paymentStatus || meta.paymentStatus,
        transactionId: lm.transactionId || meta.transactionId,
        akunPendapatan: lm.akunPendapatan || meta.akunPendapatan || "Pendapatan"
      };
    });
  }

  return base;
}

export async function syncOrderToPemasukanSheet(
  order: SalesOrderRow,
  meta: SalesOrderMetadata,
  config: HybridBackendConfig,
  lines?: SalesLineRow[]
) {
  const payload = buildSyncSheetPayload(order, meta, config, lines);
  return callHybridBackend(payload, config.url);
}
