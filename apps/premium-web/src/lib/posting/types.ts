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

export type PembelianMetode = "Tunai" | "Kredit";

export type PurchaseOrderMetadata = {
  transactionId: string;
  bayar: number;
  rekening: string;
  akunPembelian: string;
  paymentStatus: PembelianMetode;
  tanggalBayar?: string;
  keterangan?: string;
  supplierId?: string;
  supplierName?: string;
  pembelianMode?: "proper";
};

export type PurchaseLineMetadata = {
  transactionId: string;
  akunPembelian?: string;
  diskon?: number;
  unitCode?: string;
  bayar?: number;
  kurangBayar?: number;
  metode?: PembelianMetode;
  tanggalBayar?: string;
  purchaseCategoryId?: string;
};

export type PurchaseOrderRow = {
  id: string;
  organization_id: string;
  po_no: string;
  order_date: string;
  total: number;
  status: string;
  supplier_id?: string | null;
  metadata: PurchaseOrderMetadata | Record<string, unknown>;
};

export type PurchaseLineRow = {
  id: string;
  purchase_order_id: string;
  product_id: string | null;
  description: string;
  qty: number;
  unit_cost: number;
  line_total: number;
  sort_order: number;
  metadata?: PurchaseLineMetadata | Record<string, unknown>;
};
