import type { HybridBackendConfig } from "@/lib/hybrid/config";
import type { SalesOrderMetadata, SalesOrderRow } from "./types";
import { callHybridBackend } from "./pemasukan";

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
};

export function buildSyncSheetPayload(
  order: SalesOrderRow,
  meta: SalesOrderMetadata,
  config: HybridBackendConfig
): SyncSheetPayload {
  return {
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
    customer: "Premium Web",
    source: "PREMIUM_WEB"
  };
}

export async function syncOrderToPemasukanSheet(
  order: SalesOrderRow,
  meta: SalesOrderMetadata,
  config: HybridBackendConfig
) {
  const payload = buildSyncSheetPayload(order, meta, config);
  return callHybridBackend(payload, config.url);
}
