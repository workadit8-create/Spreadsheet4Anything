import type { HistoryLineRow } from "./history";

type ExportLine = HistoryLineRow & {
  orderNo: string;
  orderDate: string;
  customerName: string;
};

function escapeCsvCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: Record<string, string | number>[]): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const body = rows.map((row) => headers.map((h) => escapeCsvCell(row[h] ?? "")).join(","));
  return "\uFEFF" + [headerLine, ...body].join("\r\n");
}

export function buildProdukExportRows(lines: ExportLine[]): Record<string, string | number>[] {
  return lines.map((l) => ({
    Tanggal: l.orderDate,
    "No Invoice": l.orderNo,
    Customer: l.customerName,
    Produk: l.productName,
    SKU: l.sku || "",
    Kategori: l.categoryName,
    Qty: l.qty,
    Satuan: l.unitCode,
    Harga: l.unitPrice,
    Diskon: l.diskon,
    Total: l.lineTotal,
    Bayar: l.bayar,
    "Sisa Baris": l.kurangBayar
  }));
}

export function buildKategoriExportRows(lines: ExportLine[]): Record<string, string | number>[] {
  const byCategory = new Map<
    string,
    { categoryName: string; qty: number; total: number; lineCount: number }
  >();

  for (const l of lines) {
    const key = l.categoryId || l.categoryName || "—";
    const name = l.categoryName || "Tanpa kategori";
    const bucket = byCategory.get(key) || { categoryName: name, qty: 0, total: 0, lineCount: 0 };
    bucket.qty += l.qty;
    bucket.total += l.lineTotal;
    bucket.lineCount += 1;
    byCategory.set(key, bucket);
  }

  return [...byCategory.values()]
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName))
    .map((c) => ({
      Kategori: c.categoryName,
      "Jumlah Baris": c.lineCount,
      "Total Qty": c.qty,
      "Total Penjualan": c.total
    }));
}

export function buildHppExportRows(lines: ExportLine[]): Record<string, string | number>[] {
  return lines.map((l) => {
    const totalHpp = l.qty * l.hpp;
    const margin = l.lineTotal - totalHpp;
    return {
      Tanggal: l.orderDate,
      "No Invoice": l.orderNo,
      Customer: l.customerName,
      Produk: l.productName,
      Kategori: l.categoryName,
      Qty: l.qty,
      HPP: l.hpp,
      "Total HPP": totalHpp,
      "Total Penjualan": l.lineTotal,
      Margin: margin
    };
  });
}

export const EXPORT_HEADERS = {
  produk: [
    "Tanggal",
    "No Invoice",
    "Customer",
    "Produk",
    "SKU",
    "Kategori",
    "Qty",
    "Satuan",
    "Harga",
    "Diskon",
    "Total",
    "Bayar",
    "Sisa Baris"
  ],
  kategori: ["Kategori", "Jumlah Baris", "Total Qty", "Total Penjualan"],
  hpp: [
    "Tanggal",
    "No Invoice",
    "Customer",
    "Produk",
    "Kategori",
    "Qty",
    "HPP",
    "Total HPP",
    "Total Penjualan",
    "Margin"
  ]
} as const;
