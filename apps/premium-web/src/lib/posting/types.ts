export type PaymentStatus = "PENJUALAN TUNAI" | "PENJUALAN KREDIT";

export type SalesOrderMetadata = {
  transactionId: string;
  bayar: number;
  rekening: string;
  akunPendapatan: string;
  paymentStatus: PaymentStatus;
  tanggalBayar?: string;
  keterangan?: string;
};

export type SalesOrderRow = {
  id: string;
  organization_id: string;
  order_no: string;
  order_date: string;
  total: number;
  status: string;
  metadata: SalesOrderMetadata | Record<string, unknown>;
};
