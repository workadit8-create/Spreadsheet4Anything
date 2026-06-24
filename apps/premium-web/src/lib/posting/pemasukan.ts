import type { HybridBackendConfig } from "@/lib/hybrid/config";
import type { SalesOrderMetadata, SalesOrderRow } from "./types";

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
  config: HybridBackendConfig
): PemasukanPayload {
  return {
    apiKey: config.apiKey,
    spreadsheetId: config.spreadsheetId,
    modul: "PEMASUKAN",
    tanggalPesan: order.order_date,
    invoice: order.order_no,
    keterangan: meta.keterangan || order.order_no,
    total: Number(order.total),
    bayar: Number(meta.bayar) || 0,
    status: meta.paymentStatus,
    tanggalBayar: meta.tanggalBayar || order.order_date,
    akunPendapatan: meta.akunPendapatan || "Pendapatan",
    rekening: String(meta.rekening || "").trim(),
    transactionId: meta.transactionId
  };
}

export async function callHybridBackend(payload: PemasukanPayload, backendUrl: string) {
  let res = await fetch(backendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "manual"
  });

  if (res.status === 302 || res.status === 301 || res.status === 307) {
    const location = res.headers.get("location");
    if (location) {
      res = await fetch(location, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "follow"
      });
    }
  }

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
