import type { SupabaseClient } from "@supabase/supabase-js";
import { postJournalEntry } from "@/lib/posting/journal-supabase";
import type { JournalLineDraft } from "@/lib/posting/journal-rules";
import { buildSaleHppJournalLines, saleHppTransactionId } from "@/lib/posting/journal-rules";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";
import { productHppFromMetadata } from "@/lib/products/product-hpp";
import { isConsignmentProduct } from "@/lib/products/consignment-policy";
import { isInventoryStockEnabled } from "@/lib/inventory/sale-stock";

export type SaleHppLineInput = {
  product_id: string | null;
  qty: number;
  description?: string;
};

export type PostSaleHppJournalResult = {
  posted: boolean;
  skipped: boolean;
  totalAmount: number;
  warnings: string[];
};

export async function computeSaleHppTotal(
  supabase: SupabaseClient,
  organizationId: string,
  lines: SaleHppLineInput[]
): Promise<{ total: number; warnings: string[] }> {
  const stockLines = lines.filter((l) => l.product_id && l.qty > 0);
  if (!stockLines.length) return { total: 0, warnings: [] };

  const productIds = [...new Set(stockLines.map((l) => String(l.product_id)))];
  const { data: products, error } = await supabase
    .from("products_with_inventory_policy")
    .select("id, name, metadata, tracks_stock, category_tracks_stock")
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (error) throw new Error(error.message);

  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const warnings: string[] = [];
  let total = 0;

  for (const line of stockLines) {
    const product = productMap.get(String(line.product_id));
    if (!product) continue;

    const tracks = effectiveTracksStock(product.tracks_stock, product.category_tracks_stock);
    if (!tracks) continue;

    const meta = (product.metadata || {}) as Record<string, unknown>;
    if (isConsignmentProduct(meta)) continue;

    const hpp = productHppFromMetadata(meta);
    const qty = Number(line.qty) || 0;
    if (hpp == null) {
      warnings.push(`Produk "${product.name}" belum punya HPP — baris dilewati`);
      continue;
    }
    if (hpp <= 0) continue;

    total += hpp * qty;
  }

  return { total: Math.round(total), warnings };
}

/**
 * Post jurnal HPP penjualan (Dr Beban HPP / Cr Persediaan) jika add-on inventory aktif.
 * Idempotent per sales order. Returns null jika inventory off.
 */
export async function postSaleHppJournalIfEnabled(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    salesOrderId: string;
    orderNo: string;
    entryDate: string;
    keterangan: string;
    lines: SaleHppLineInput[];
  }
): Promise<PostSaleHppJournalResult | null> {
  const enabled = await isInventoryStockEnabled(supabase, params.organizationId);
  if (!enabled) return null;

  const { total, warnings } = await computeSaleHppTotal(
    supabase,
    params.organizationId,
    params.lines
  );

  if (total <= 0) {
    return { posted: false, skipped: false, totalAmount: 0, warnings };
  }

  const journalLines: JournalLineDraft[] = buildSaleHppJournalLines({
    entryDate: params.entryDate,
    orderNo: params.orderNo,
    keterangan: params.keterangan,
    totalHpp: total
  });

  const result = await postJournalEntry(
    supabase,
    {
      organizationId: params.organizationId,
      modul: "HPP_PENJUALAN",
      transactionId: saleHppTransactionId(params.salesOrderId),
      docNo: params.orderNo,
      entryDate: params.entryDate,
      sourceDocType: "SALES_ORDER",
      sourceDocId: params.salesOrderId
    },
    journalLines
  );

  return {
    posted: !result.skipped,
    skipped: result.skipped,
    totalAmount: total,
    warnings
  };
}
