import type { SalesLineMetadata, SalesLineRow } from "./types";

export function lineKurangBayar(line: SalesLineRow): number {
  const meta = (line.metadata || {}) as SalesLineMetadata;
  if (meta.kurangBayar != null && !Number.isNaN(Number(meta.kurangBayar))) {
    return Math.max(0, Number(meta.kurangBayar));
  }
  const bayar = Number(meta.bayar) || 0;
  return Math.max(0, Number(line.line_total) - bayar);
}

export function lineBayar(line: SalesLineRow): number {
  const meta = (line.metadata || {}) as SalesLineMetadata;
  return Number(meta.bayar) || 0;
}

export type PiutangRow = {
  salesOrderId: string;
  invoiceNo: string;
  orderDate: string;
  customerId: string | null;
  customerName: string;
  grandTotal: number;
  sisaTagihan: number;
};

export function summarizePiutangFromLines(
  order: {
    id: string;
    order_no: string;
    order_date: string;
    customer_id: string | null;
    metadata: Record<string, unknown>;
  },
  lines: SalesLineRow[]
): PiutangRow | null {
  const meta = order.metadata || {};
  const customerName = String(meta.customerName || "");

  let grandTotal = 0;
  let sisaTagihan = 0;

  if (lines.length) {
    for (const line of lines) {
      grandTotal += Number(line.line_total) || 0;
      sisaTagihan += lineKurangBayar(line);
    }
  } else {
    const total = Number((order as { total?: number }).total) || 0;
    grandTotal = total;
    const bayar = Number(meta.bayar) || 0;
    sisaTagihan = Math.max(0, total - bayar);
  }

  if (sisaTagihan <= 0) return null;

  return {
    salesOrderId: order.id,
    invoiceNo: order.order_no,
    orderDate: order.order_date,
    customerId: order.customer_id,
    customerName,
    grandTotal,
    sisaTagihan
  };
}

/** Alokasi pelunasan ke baris invoice — mirror updatePemasukanLedger di GAS. */
export function allocatePelunasanToLines(
  lines: SalesLineRow[],
  nominal: number,
  tanggalBayar: string
): { lineId: string; metadata: SalesLineMetadata }[] {
  let sisaAlokasi = nominal;
  const updates: { lineId: string; metadata: SalesLineMetadata }[] = [];

  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);

  for (const line of sorted) {
    if (sisaAlokasi <= 0) break;

    const kurangLama = lineKurangBayar(line);
    if (kurangLama <= 0) continue;

    const bayarUntukBaris = Math.min(sisaAlokasi, kurangLama);
    if (bayarUntukBaris <= 0) continue;

    const meta = (line.metadata || {}) as SalesLineMetadata;
    const bayarBaru = lineBayar(line) + bayarUntukBaris;
    const kurangBaru = Math.max(0, Number(line.line_total) - bayarBaru);

    updates.push({
      lineId: line.id,
      metadata: {
        ...meta,
        transactionId: meta.transactionId || "",
        bayar: bayarBaru,
        kurangBayar: kurangBaru,
        paymentStatus: kurangBaru > 0 ? "PENJUALAN KREDIT" : "PENJUALAN TUNAI",
        tanggalBayar: kurangBaru <= 0 ? tanggalBayar : meta.tanggalBayar
      }
    });

    sisaAlokasi -= bayarUntukBaris;
  }

  if (!updates.length) {
    throw new Error("Tidak ada baris piutang aktif untuk invoice ini.");
  }
  if (sisaAlokasi > 0.01) {
    throw new Error(
      `Alokasi gagal. Nominal ${sisaAlokasi} tidak dapat dialokasikan ke baris invoice.`
    );
  }

  return updates;
}
