import { rowsToCsv } from "@/lib/penjualan/export-csv";
import type { ExportPurchaseLine } from "./fetch-history-data";

export { rowsToCsv };

export function buildProdukExportRows(lines: ExportPurchaseLine[]): Record<string, string | number>[] {
  return lines.map((l) => ({
    Tanggal: l.orderDate,
    "No PO": l.poNo,
    Supplier: l.supplierName,
    Status: l.orderStatus,
    Barang: l.description,
    Kategori: l.categoryLabel,
    "Akun COA": l.akunPembelian,
    Qty: l.qty,
    Satuan: l.unitCode,
    Harga: l.unitCost,
    Diskon: l.diskon,
    Total: l.lineTotal,
    Bayar: l.bayar,
    "Sisa Baris": l.kurangBayar,
    Metode: l.metode
  }));
}

export function buildSupplierExportRows(lines: ExportPurchaseLine[]): Record<string, string | number>[] {
  const bySupplier = new Map<
    string,
    {
      supplierName: string;
      poIds: Set<string>;
      lineCount: number;
      qty: number;
      total: number;
    }
  >();

  for (const l of lines) {
    const key = l.supplierId || l.supplierName || "—";
    const name = l.supplierName || "Tanpa supplier";
    const bucket = bySupplier.get(key) || {
      supplierName: name,
      poIds: new Set<string>(),
      lineCount: 0,
      qty: 0,
      total: 0
    };
    bucket.poIds.add(l.poNo);
    bucket.lineCount += 1;
    bucket.qty += l.qty;
    bucket.total += l.lineTotal;
    bySupplier.set(key, bucket);
  }

  return [...bySupplier.values()]
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName))
    .map((s) => ({
      Supplier: s.supplierName,
      "Jumlah PO": s.poIds.size,
      "Jumlah Baris": s.lineCount,
      "Total Qty": s.qty,
      "Total Pembelian": s.total
    }));
}

export const EXPORT_HEADERS = {
  produk: [
    "Tanggal",
    "No PO",
    "Supplier",
    "Status",
    "Barang",
    "Kategori",
    "Akun COA",
    "Qty",
    "Satuan",
    "Harga",
    "Diskon",
    "Total",
    "Bayar",
    "Sisa Baris",
    "Metode"
  ],
  supplier: ["Supplier", "Jumlah PO", "Jumlah Baris", "Total Qty", "Total Pembelian"]
} as const;
