import type { PurchaseLineMetadata, PurchaseLineRow } from "./types";

export function lineKurangBayar(line: PurchaseLineRow): number {
  const meta = (line.metadata || {}) as PurchaseLineMetadata;
  const computed = Math.max(0, Number(line.line_total) - lineBayar(line));
  if (meta.kurangBayar != null && !Number.isNaN(Number(meta.kurangBayar))) {
    const fromMeta = Math.max(0, Number(meta.kurangBayar));
    if (fromMeta <= 0.01 && computed > 0.01) return computed;
    return fromMeta;
  }
  return computed;
}

export function lineBayar(line: PurchaseLineRow): number {
  const meta = (line.metadata || {}) as PurchaseLineMetadata;
  return Number(meta.bayar) || 0;
}

export type HutangRow = {
  purchaseOrderId: string;
  poNo: string;
  orderDate: string;
  supplierId: string | null;
  supplierName: string;
  grandTotal: number;
  sisaTagihan: number;
  status: string;
};

export function summarizeHutangFromLines(
  order: {
    id: string;
    po_no: string;
    order_date: string;
    supplier_id: string | null;
    total?: number;
    status?: string;
    metadata: Record<string, unknown>;
  },
  lines: PurchaseLineRow[]
): HutangRow | null {
  const meta = order.metadata || {};
  const supplierName = String(meta.supplierName || "");
  const orderTotal = Number(order.total) || 0;
  const orderBayar = Number(meta.bayar) || 0;
  const paymentStatus = String(meta.paymentStatus || "");

  let grandTotal = 0;
  let sisaTagihan = 0;

  if (lines.length) {
    grandTotal = lines.reduce((sum, line) => sum + Number(line.line_total) || 0, 0);
    const hasLineLevelPayment = lines.some((line) => {
      const m = (line.metadata || {}) as PurchaseLineMetadata;
      return m.bayar != null || m.kurangBayar != null;
    });

    if (hasLineLevelPayment) {
      sisaTagihan = lines.reduce((sum, line) => sum + lineKurangBayar(line), 0);
    } else {
      grandTotal = grandTotal || orderTotal;
      sisaTagihan = Math.max(0, grandTotal - orderBayar);
    }
  } else {
    grandTotal = orderTotal;
    sisaTagihan = Math.max(0, orderTotal - orderBayar);
  }

  const effectiveTotal = grandTotal || orderTotal;
  if (paymentStatus === "Tunai" && orderBayar >= effectiveTotal - 0.01) {
    sisaTagihan = 0;
  }

  if (sisaTagihan <= 0.01) return null;

  return {
    purchaseOrderId: order.id,
    poNo: order.po_no,
    orderDate: order.order_date,
    supplierId: order.supplier_id,
    supplierName,
    grandTotal,
    sisaTagihan,
    status: String(order.status || "CONFIRMED")
  };
}

export function allocatePelunasanToPurchaseLines(
  lines: PurchaseLineRow[],
  nominal: number,
  tanggalBayar: string
): { lineId: string; metadata: PurchaseLineMetadata }[] {
  let sisaAlokasi = nominal;
  const updates: { lineId: string; metadata: PurchaseLineMetadata }[] = [];

  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);

  for (const line of sorted) {
    if (sisaAlokasi <= 0) break;

    const kurangLama = lineKurangBayar(line);
    if (kurangLama <= 0) continue;

    const bayarUntukBaris = Math.min(sisaAlokasi, kurangLama);
    if (bayarUntukBaris <= 0) continue;

    const meta = (line.metadata || {}) as PurchaseLineMetadata;
    const bayarBaru = lineBayar(line) + bayarUntukBaris;
    const kurangBaru = Math.max(0, Number(line.line_total) - bayarBaru);

    updates.push({
      lineId: line.id,
      metadata: {
        ...meta,
        transactionId: meta.transactionId || "",
        bayar: bayarBaru,
        kurangBayar: kurangBaru,
        metode: kurangBaru > 0 ? "Kredit" : "Tunai",
        tanggalBayar: kurangBaru <= 0 ? tanggalBayar : meta.tanggalBayar
      }
    });

    sisaAlokasi -= bayarUntukBaris;
  }

  if (!updates.length) {
    throw new Error("Tidak ada baris hutang aktif untuk PO ini.");
  }
  if (sisaAlokasi > 0.01) {
    throw new Error(
      `Alokasi gagal. Nominal ${sisaAlokasi} tidak dapat dialokasikan ke baris PO.`
    );
  }

  return updates;
}

export function recomputePurchaseOrderPaymentMeta(
  orderMeta: Record<string, unknown>,
  lines: PurchaseLineRow[]
): Record<string, unknown> {
  const totalBayar = lines.reduce((sum, line) => sum + lineBayar(line), 0);
  const sisa = lines.reduce((sum, line) => sum + lineKurangBayar(line), 0);

  return {
    ...orderMeta,
    bayar: totalBayar,
    paymentStatus: sisa > 0.01 ? "Kredit" : "Tunai",
    tanggalBayar: sisa <= 0.01 ? orderMeta.tanggalBayar : orderMeta.tanggalBayar
  };
}
