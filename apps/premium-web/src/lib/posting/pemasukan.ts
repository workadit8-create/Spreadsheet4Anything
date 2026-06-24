import type { HybridBackendConfig } from "@/lib/hybrid/config";
import type { PaymentStatus, SalesOrderMetadata, SalesOrderRow } from "./types";

export type PemasukanPayload = {
  apiKey: string;
  spreadsheetId: string;
  modul: "PEMASUKAN";
  tanggalPesan: string;
  invoice: string;
  keterangan: string;
  total: number;
  bayar: number;
  status: string;
  tanggalBayar: string;
  akunPendapatan: string;
  rekening: string;
  transactionId: string;
};

export function buildPemasukanPayload(
  order: SalesOrderRow,
  meta: SalesOrderMetadata,
  config: HybridBackendConfig,
  overrides?: {
    total?: number;
    bayar?: number;
    paymentStatus?: PaymentStatus;
    keterangan?: string;
    transactionId?: string;
    akunPendapatan?: string;
    tanggalBayar?: string;
  }
): PemasukanPayload {
  const total = overrides?.total ?? Number(order.total);
  const bayar = overrides?.bayar ?? (Number(meta.bayar) || 0);
  const paymentStatus = overrides?.paymentStatus ?? meta.paymentStatus;
  return {
    apiKey: config.apiKey,
    spreadsheetId: config.spreadsheetId,
    modul: "PEMASUKAN",
    tanggalPesan: order.order_date,
    invoice: order.order_no,
    keterangan: overrides?.keterangan || meta.keterangan || order.order_no,
    total,
    bayar,
    status: paymentStatus,
    tanggalBayar: overrides?.tanggalBayar || meta.tanggalBayar || order.order_date,
    akunPendapatan: overrides?.akunPendapatan || meta.akunPendapatan || "Pendapatan",
    rekening: String(meta.rekening || "").trim(),
    transactionId: overrides?.transactionId || meta.transactionId
  };
}

export async function callHybridBackend(
  payload: PemasukanPayload | Record<string, unknown>,
  backendUrl: string
) {
  const res = await fetch(backendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow"
  });

  const text = await res.text();
  let result: { success?: boolean; message?: string } = {};
  try {
    result = JSON.parse(text || "{}");
  } catch {
    throw new Error(`Respons backend tidak valid (HTTP ${res.status})`);
  }

  if (!res.ok || !result.success) {
    throw new Error(result.message || `Posting gagal (HTTP ${res.status})`);
  }

  return result;
}
