export const STOCK_OWNERSHIPS = ["owned", "consignment"] as const;
export type StockOwnership = (typeof STOCK_OWNERSHIPS)[number];

export const STOCK_OWNERSHIP_LABELS: Record<StockOwnership, string> = {
  owned: "Milik sendiri (beli putus)",
  consignment: "Titip jual"
};

export function parseStockOwnership(raw: unknown): StockOwnership {
  const v = String(raw || "owned").trim();
  return v === "consignment" ? "consignment" : "owned";
}

export function productStockOwnership(
  metadata: Record<string, unknown> | null | undefined
): StockOwnership {
  return parseStockOwnership((metadata || {}).stockOwnership);
}

export function isConsignmentProduct(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  return productStockOwnership(metadata) === "consignment";
}

export function consignmentSupplierIdFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const raw = (metadata || {}).consignmentSupplierId;
  const id = String(raw || "").trim();
  return id || null;
}

export function consignmentSettlementPriceFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): number | null {
  const raw = (metadata || {}).consignmentSettlementPrice;
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function mergeConsignmentProductMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: {
    stockOwnership?: StockOwnership;
    consignmentSupplierId?: string | null;
    consignmentSettlementPrice?: number | null;
  }
): Record<string, unknown> {
  const base = { ...(existing || {}) };

  if (patch.stockOwnership !== undefined) {
    base.stockOwnership = patch.stockOwnership;
    if (patch.stockOwnership === "owned") {
      delete base.consignmentSupplierId;
      delete base.consignmentSettlementPrice;
    }
  }

  if (patch.consignmentSupplierId !== undefined) {
    const id = String(patch.consignmentSupplierId || "").trim();
    if (id) base.consignmentSupplierId = id;
    else delete base.consignmentSupplierId;
  }

  if (patch.consignmentSettlementPrice !== undefined) {
    if (patch.consignmentSettlementPrice == null) delete base.consignmentSettlementPrice;
    else base.consignmentSettlementPrice = patch.consignmentSettlementPrice;
  }

  return base;
}
