import {
  effectiveProductKind,
  effectiveTracksStock,
  PRODUCT_KIND_LABELS,
  type ProductKind
} from "@/lib/products/inventory-policy";

export type ProductStockRowInput = {
  productKind: string | null | undefined;
  categoryKind: string | null | undefined;
  tracksStock: boolean | null | undefined;
  categoryTracksStock: boolean | null | undefined;
  categoryUsesRecipe: boolean;
  hasActiveBom: boolean;
  qty: number;
  unitCode: string;
  purchaseUnitCode?: string | null;
  conversionFactor?: number | null;
};

export type ProductStockDisplay = {
  kind: ProductKind;
  kindLabel: string;
  showQty: boolean;
  qty: number | null;
  qtyLabel: string;
  unitLabel: string;
  note?: string;
};

export function resolveProductStockDisplay(input: ProductStockRowInput): ProductStockDisplay {
  const kind = effectiveProductKind(input.productKind, input.categoryKind);
  const tracks = effectiveTracksStock(input.tracksStock, input.categoryTracksStock);
  const unitCode = input.unitCode || "PCS";
  const purchaseCode = input.purchaseUnitCode?.trim() || unitCode;

  let showQty = false;
  let note: string | undefined;

  if (kind === "service") {
    showQty = false;
  } else if (kind === "menu_item") {
    showQty = tracks;
    if (!tracks && (input.categoryUsesRecipe || input.hasActiveBom)) {
      note = "Tanpa stok menu · konsumsi via BOM";
    } else if (!tracks) {
      note = "Tanpa stok";
    }
  } else {
    showQty = tracks;
    if (!tracks) {
      note = "Tanpa stok";
    }
  }

  if (kind === "raw_material" && showQty) {
    if (purchaseCode !== unitCode && input.conversionFactor) {
      note = `1 ${purchaseCode} = ${formatFactor(input.conversionFactor)} ${unitCode} (BOM)`;
    } else if (purchaseCode !== unitCode) {
      note = `Satuan beli: ${purchaseCode}`;
    }
  }

  const qty = showQty ? input.qty : null;
  const qtyLabel = showQty ? formatQty(input.qty) : "—";
  const unitLabel =
    kind === "raw_material" && purchaseCode !== unitCode
      ? `${purchaseCode} → ${unitCode}`
      : unitCode;

  return {
    kind,
    kindLabel: PRODUCT_KIND_LABELS[kind],
    showQty,
    qty,
    qtyLabel,
    unitLabel,
    note
  };
}

function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("id-ID", { maximumFractionDigits: 4 });
}

function formatFactor(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("id-ID", { maximumFractionDigits: 6 });
}
