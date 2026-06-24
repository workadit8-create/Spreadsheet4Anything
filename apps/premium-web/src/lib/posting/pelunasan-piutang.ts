import type { HybridBackendConfig } from "@/lib/hybrid/config";
import { callHybridBackend } from "./pemasukan";

export type PelunasanPiutangPayload = {
  apiKey: string;
  spreadsheetId: string;
  modul: "PELUNASAN_PIUTANG";
  tanggalBayar: string;
  invoice: string;
  customer: string;
  nominal: number;
  rekening: string;
  keterangan: string;
  transactionId: string;
};

export function buildPelunasanPiutangPayload(
  meta: {
    invoiceNo: string;
    customerName: string;
    rekening: string;
    keterangan?: string;
    transactionId: string;
    tanggalBayar: string;
  },
  nominal: number,
  config: HybridBackendConfig
): PelunasanPiutangPayload {
  return {
    apiKey: config.apiKey,
    spreadsheetId: config.spreadsheetId,
    modul: "PELUNASAN_PIUTANG",
    tanggalBayar: meta.tanggalBayar,
    invoice: meta.invoiceNo,
    customer: meta.customerName,
    nominal,
    rekening: meta.rekening,
    keterangan: meta.keterangan || `Pelunasan ${meta.invoiceNo}`,
    transactionId: meta.transactionId
  };
}

export type SyncPelunasanPayload = {
  apiKey: string;
  spreadsheetId: string;
  action: "SYNC_PREMIUM_PELUNASAN_PIUTANG";
  tanggal: string;
  invoice: string;
  customer: string;
  nominal: number;
  rekening: string;
  keterangan: string;
  transactionId: string;
  alreadyPosted: boolean;
  source: string;
};

export function buildSyncPelunasanPayload(
  meta: {
    invoiceNo: string;
    customerName: string;
    rekening: string;
    coaAccountName?: string;
    keterangan?: string;
    transactionId: string;
    tanggalBayar: string;
  },
  nominal: number,
  config: HybridBackendConfig
): SyncPelunasanPayload {
  const akunKas = meta.coaAccountName || meta.rekening;
  return {
    apiKey: config.apiKey,
    spreadsheetId: config.spreadsheetId,
    action: "SYNC_PREMIUM_PELUNASAN_PIUTANG",
    tanggal: meta.tanggalBayar,
    invoice: meta.invoiceNo,
    customer: meta.customerName,
    nominal,
    rekening: akunKas,
    keterangan: meta.keterangan || `Pelunasan ${meta.invoiceNo}`,
    transactionId: meta.transactionId,
    alreadyPosted: true,
    source: "PREMIUM_WEB"
  };
}

export async function syncPelunasanToSheet(
  meta: {
    invoiceNo: string;
    customerName: string;
    rekening: string;
    coaAccountName?: string;
    keterangan?: string;
    transactionId: string;
    tanggalBayar: string;
  },
  nominal: number,
  config: HybridBackendConfig
) {
  const payload = buildSyncPelunasanPayload(meta, nominal, config);
  return callHybridBackend(payload, config.url);
}
