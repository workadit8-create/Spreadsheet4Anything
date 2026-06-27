import type { SupabaseClient } from "@supabase/supabase-js";
import { isInventoryStockEnabled, resolveWarehouseIdForSale } from "@/lib/inventory/sale-stock";
import {
  hasPurchaseStockInMovement,
  hasPurchaseStockVoidMovement,
  isInventoryPurchaseOrder,
  purchaseStockLinesFromProducts,
  receivePurchaseStock,
  reversePurchaseStock,
  unitHppFromPurchaseLine,
  updateProductHppFromPurchaseLines
} from "@/lib/inventory/purchase-inventory";
import type { PurchaseLineRow, PurchaseOrderRow } from "@/lib/posting/types";

function asLineMeta(raw: unknown): Record<string, unknown> {
  return (raw || {}) as Record<string, unknown>;
}

type OrderWithWarehouse = PurchaseOrderRow & {
  warehouse_id?: string | null;
  outlet_code?: string | null;
};

export async function receivePurchaseStockForOrderIfEnabled(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    order: OrderWithWarehouse;
    lines: PurchaseLineRow[];
    skipIfExists?: boolean;
    createdBy?: string | null;
  }
): Promise<{ received: boolean; skipped: boolean; hppUpdated: number }> {
  const meta = (params.order.metadata || {}) as Record<string, unknown>;
  if (!isInventoryPurchaseOrder(meta)) {
    return { received: false, skipped: false, hppUpdated: 0 };
  }

  const enabled = await isInventoryStockEnabled(supabase, params.organizationId);
  if (!enabled) return { received: false, skipped: false, hppUpdated: 0 };

  if (params.skipIfExists) {
    const exists = await hasPurchaseStockInMovement(
      supabase,
      params.organizationId,
      params.order.id
    );
    if (exists) return { received: false, skipped: true, hppUpdated: 0 };
  }

  let warehouseId = params.order.warehouse_id ? String(params.order.warehouse_id) : null;
  if (!warehouseId) {
    warehouseId = await resolveWarehouseIdForSale(supabase, params.organizationId, {
      outletCode: params.order.outlet_code
    });
  }
  if (!warehouseId) {
    throw new Error("Gudang belum dikonfigurasi — tidak bisa terima stok pembelian");
  }

  const stockInputs = params.lines
    .filter((l) => l.product_id)
    .map((l) => ({ product_id: String(l.product_id), qty: Number(l.qty) || 0 }));

  const stockLines = await purchaseStockLinesFromProducts(
    supabase,
    params.organizationId,
    stockInputs
  );

  const linesWithHpp = stockLines.map((sl) => {
    const src = params.lines.find((l) => l.product_id === sl.productId);
    const lm = asLineMeta(src?.metadata);
    return {
      ...sl,
      unitHpp: src
        ? unitHppFromPurchaseLine(
            lm.dpp != null ? Number(lm.dpp) : null,
            src.qty,
            src.unit_cost,
            Number(lm.diskon) || 0
          )
        : null
    };
  });

  await receivePurchaseStock(supabase, {
    organizationId: params.organizationId,
    warehouseId,
    purchaseOrderId: params.order.id,
    poNo: params.order.po_no,
    lines: linesWithHpp,
    createdBy: params.createdBy,
    notes: "Pembelian inventory"
  });

  const hppUpdated = await updateProductHppFromPurchaseLines(
    supabase,
    params.organizationId,
    params.lines
  );

  return { received: true, skipped: false, hppUpdated };
}

export async function reversePurchaseStockForOrderIfEnabled(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    order: OrderWithWarehouse;
    lines: PurchaseLineRow[];
    createdBy?: string | null;
  }
): Promise<{ reversed: boolean; skipped: boolean }> {
  const meta = (params.order.metadata || {}) as Record<string, unknown>;
  if (!isInventoryPurchaseOrder(meta)) {
    return { reversed: false, skipped: false };
  }

  const enabled = await isInventoryStockEnabled(supabase, params.organizationId);
  if (!enabled) return { reversed: false, skipped: false };

  const hadIn = await hasPurchaseStockInMovement(
    supabase,
    params.organizationId,
    params.order.id
  );
  if (!hadIn) return { reversed: false, skipped: true };

  const alreadyVoid = await hasPurchaseStockVoidMovement(
    supabase,
    params.organizationId,
    params.order.id
  );
  if (alreadyVoid) return { reversed: false, skipped: true };

  let warehouseId = params.order.warehouse_id ? String(params.order.warehouse_id) : null;
  if (!warehouseId) {
    warehouseId = await resolveWarehouseIdForSale(supabase, params.organizationId, {
      outletCode: params.order.outlet_code
    });
  }
  if (!warehouseId) {
    throw new Error("Gudang tidak ditemukan — tidak bisa balik stok pembelian");
  }

  const stockInputs = params.lines
    .filter((l) => l.product_id)
    .map((l) => ({ product_id: String(l.product_id), qty: Number(l.qty) || 0 }));

  const stockLines = await purchaseStockLinesFromProducts(
    supabase,
    params.organizationId,
    stockInputs
  );

  await reversePurchaseStock(supabase, {
    organizationId: params.organizationId,
    warehouseId,
    purchaseOrderId: params.order.id,
    poNo: params.order.po_no,
    lines: stockLines,
    createdBy: params.createdBy,
    notes: "Void pembelian inventory"
  });

  return { reversed: true, skipped: false };
}
