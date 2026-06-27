import type { SupabaseClient } from "@supabase/supabase-js";
import { postJournalEntry } from "@/lib/posting/journal-supabase";
import type { JournalLineDraft } from "@/lib/posting/journal-rules";
import {
  buildConsignmentSaleJournalLines,
  consignmentSaleTransactionId
} from "@/lib/posting/journal-rules";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";
import {
  consignmentSettlementPriceFromMetadata,
  consignmentSupplierIdFromMetadata,
  isConsignmentProduct
} from "@/lib/products/consignment-policy";
import { isTitipJualEnabled } from "@/lib/inventory/consignment-gate";

export type ConsignmentSaleLineInput = {
  product_id: string | null;
  qty: number;
  description?: string;
};

export type ConsignmentLiabilityDraft = {
  productId: string;
  supplierId: string;
  qty: number;
  unitSettlement: number;
  totalAmount: number;
};

export type PostConsignmentSaleResult = {
  posted: boolean;
  skipped: boolean;
  totalAmount: number;
  liabilityCount: number;
  warnings: string[];
};

export async function computeConsignmentSaleLiabilities(
  supabase: SupabaseClient,
  organizationId: string,
  lines: ConsignmentSaleLineInput[]
): Promise<{ liabilities: ConsignmentLiabilityDraft[]; total: number; warnings: string[] }> {
  const stockLines = lines.filter((l) => l.product_id && l.qty > 0);
  if (!stockLines.length) return { liabilities: [], total: 0, warnings: [] };

  const productIds = [...new Set(stockLines.map((l) => String(l.product_id)))];
  const { data: products, error } = await supabase
    .from("products_with_inventory_policy")
    .select("id, name, metadata, tracks_stock, category_tracks_stock")
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (error) throw new Error(error.message);

  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const warnings: string[] = [];
  const liabilities: ConsignmentLiabilityDraft[] = [];
  let total = 0;

  for (const line of stockLines) {
    const product = productMap.get(String(line.product_id));
    if (!product) continue;

    const tracks = effectiveTracksStock(product.tracks_stock, product.category_tracks_stock);
    if (!tracks) continue;

    const meta = (product.metadata || {}) as Record<string, unknown>;
    if (!isConsignmentProduct(meta)) continue;

    const supplierId = consignmentSupplierIdFromMetadata(meta);
    const unitSettlement = consignmentSettlementPriceFromMetadata(meta);
    const qty = Number(line.qty) || 0;

    if (!supplierId) {
      warnings.push(`Produk "${product.name}" titip tanpa supplier — baris dilewati`);
      continue;
    }
    if (unitSettlement == null) {
      warnings.push(`Produk "${product.name}" belum punya harga settlement — baris dilewati`);
      continue;
    }

    const lineTotal = Math.round(unitSettlement * qty);
    if (lineTotal <= 0) continue;

    liabilities.push({
      productId: product.id,
      supplierId,
      qty,
      unitSettlement,
      totalAmount: lineTotal
    });
    total += lineTotal;
  }

  return { liabilities, total: Math.round(total), warnings };
}

export async function postConsignmentSaleJournalIfEnabled(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    salesOrderId: string;
    orderNo: string;
    entryDate: string;
    keterangan: string;
    lines: ConsignmentSaleLineInput[];
  }
): Promise<PostConsignmentSaleResult | null> {
  const enabled = await isTitipJualEnabled(supabase, params.organizationId);
  if (!enabled) return null;

  const { liabilities, total, warnings } = await computeConsignmentSaleLiabilities(
    supabase,
    params.organizationId,
    params.lines
  );

  if (total <= 0) {
    return { posted: false, skipped: false, totalAmount: 0, liabilityCount: 0, warnings };
  }

  const journalLines: JournalLineDraft[] = buildConsignmentSaleJournalLines({
    entryDate: params.entryDate,
    orderNo: params.orderNo,
    keterangan: params.keterangan,
    totalSettlement: total
  });

  const result = await postJournalEntry(
    supabase,
    {
      organizationId: params.organizationId,
      modul: "TITIP_JUAL_PENJUALAN",
      transactionId: consignmentSaleTransactionId(params.salesOrderId),
      docNo: params.orderNo,
      entryDate: params.entryDate,
      sourceDocType: "SALES_ORDER",
      sourceDocId: params.salesOrderId
    },
    journalLines
  );

  if (!result.skipped && liabilities.length) {
    const { data: existing } = await supabase
      .from("consignment_liabilities")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("sales_order_id", params.salesOrderId)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const rows = liabilities.map((l) => ({
        organization_id: params.organizationId,
        sales_order_id: params.salesOrderId,
        product_id: l.productId,
        supplier_id: l.supplierId,
        qty: l.qty,
        unit_settlement: l.unitSettlement,
        total_amount: l.totalAmount,
        status: "OPEN"
      }));
      const { error: liabErr } = await supabase.from("consignment_liabilities").insert(rows);
      if (liabErr) throw new Error(liabErr.message);
    }
  }

  return {
    posted: !result.skipped,
    skipped: result.skipped,
    totalAmount: total,
    liabilityCount: liabilities.length,
    warnings
  };
}
