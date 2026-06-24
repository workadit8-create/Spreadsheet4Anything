export type PaymentStatus = "PENJUALAN TUNAI" | "PENJUALAN KREDIT";

export type SalesOrderMetadata = {
  transactionId: string;
  bayar: number;
  rekening: string;
  akunPendapatan: string;
  paymentStatus: PaymentStatus;
  tanggalBayar?: string;
  keterangan?: string;
  customerId?: string;
  customerName?: string;
  invoiceMode?: "lab" | "proper";
};

export type SalesLineMetadata = {
  transactionId: string;
  akunPendapatan?: string;
  diskon?: number;
  unitCode?: string;
  bayar?: number;
  kurangBayar?: number;
  paymentStatus?: PaymentStatus;
  tanggalBayar?: string;
};

export type SalesOrderRow = {
  id: string;
  organization_id: string;
  order_no: string;
  order_date: string;
  total: number;
  status: string;
  customer_id?: string | null;
  metadata: SalesOrderMetadata | Record<string, unknown>;
};

export type SalesLineRow = {
  id: string;
  sales_order_id: string;
  product_id: string | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  metadata?: SalesLineMetadata | Record<string, unknown>;
};
