import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assetCategoryFromCoa,
  defaultAccumCoaForAsset,
  defaultDepreciationExpenseCoa,
  isFixedAssetCoaName
} from "@/lib/assets/coa-defaults";
import type { PurchaseLineMetadata, PurchaseLineRow, PurchaseOrderRow } from "@/lib/posting/types";

export type FixedAssetLineMeta = {
  enabled: boolean;
  usefulLifeMonths?: number;
  salvageValue?: number;
  category?: string;
};

export function fixedAssetFromLineMeta(raw: unknown): FixedAssetLineMeta | null {
  const m = (raw || {}) as Record<string, unknown>;
  const fa = (m.fixedAsset || {}) as Record<string, unknown>;
  if (fa.enabled !== true) return null;
  return {
    enabled: true,
    usefulLifeMonths: fa.usefulLifeMonths != null ? Number(fa.usefulLifeMonths) : undefined,
    salvageValue: fa.salvageValue != null ? Number(fa.salvageValue) : undefined,
    category: fa.category ? String(fa.category) : undefined
  };
}

async function loadCoaContext(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ subByName: Map<string, string>; expenseAccounts: string[] }> {
  const { data, error } = await supabase
    .from("coa_accounts")
    .select("name, account_type, metadata")
    .eq("organization_id", organizationId)
    .eq("active", true);

  if (error) {
    throw new Error("Gagal baca COA: " + error.message);
  }

  const subByName = new Map<string, string>();
  const expenseAccounts: string[] = [];

  for (const row of data || []) {
    const name = String(row.name || "");
    const sub = String((row.metadata as Record<string, unknown> | null)?.sub_category || "");
    subByName.set(name, sub);
    if (row.account_type === "Beban") expenseAccounts.push(name);
  }

  return { subByName, expenseAccounts };
}

function acquisitionCostFromLine(line: PurchaseLineRow, meta: PurchaseLineMetadata): number {
  if (meta.dpp != null && meta.dpp > 0) return meta.dpp;
  const tax = Number(meta.taxAmount) || 0;
  return Math.max(0, Number(line.line_total) - tax);
}

export type CreateAssetsFromPoResult = {
  created: number;
  skipped: number;
  assetIds: string[];
};

export async function createFixedAssetsFromPostedPurchaseOrder(
  supabase: SupabaseClient,
  organizationId: string,
  order: PurchaseOrderRow,
  lines: PurchaseLineRow[]
): Promise<CreateAssetsFromPoResult> {
  const { subByName, expenseAccounts } = await loadCoaContext(supabase, organizationId);
  const expenseCoa = defaultDepreciationExpenseCoa(expenseAccounts);

  const lineIds = lines.map((l) => l.id);
  const existingLineIds = new Set<string>();

  if (lineIds.length) {
    const { data: existing } = await supabase
      .from("fixed_assets")
      .select("purchase_line_id")
      .eq("organization_id", organizationId)
      .in("purchase_line_id", lineIds);

    for (const row of existing || []) {
      if (row.purchase_line_id) existingLineIds.add(row.purchase_line_id);
    }
  }

  let created = 0;
  let skipped = 0;
  const assetIds: string[] = [];

  for (const line of lines) {
    const meta = (line.metadata || {}) as PurchaseLineMetadata;
    const assetCoa = String(meta.akunPembelian || "").trim();
    const faMeta = fixedAssetFromLineMeta(line.metadata);
    const shouldCreate =
      faMeta?.enabled === true ||
      (faMeta == null && isFixedAssetCoaName(assetCoa, subByName));

    if (!shouldCreate || !assetCoa) continue;

    if (existingLineIds.has(line.id)) {
      skipped += 1;
      continue;
    }

    const acquisitionCost = acquisitionCostFromLine(line, meta);
    if (acquisitionCost <= 0) {
      skipped += 1;
      continue;
    }

    const usefulLifeMonths = Math.max(1, faMeta?.usefulLifeMonths ?? 48);
    const salvageValue = Math.max(0, faMeta?.salvageValue ?? 0);
    const accumCoa = defaultAccumCoaForAsset(assetCoa);
    const category = faMeta?.category || assetCategoryFromCoa(assetCoa);
    const code = `${order.po_no}-${line.sort_order + 1}`;

    const { data: inserted, error } = await supabase
      .from("fixed_assets")
      .insert({
        organization_id: organizationId,
        purchase_order_id: order.id,
        purchase_line_id: line.id,
        code,
        name: line.description,
        category,
        acquisition_date: order.order_date,
        acquisition_cost: acquisitionCost,
        salvage_value: salvageValue,
        useful_life_months: usefulLifeMonths,
        asset_coa_account: assetCoa,
        accumulated_depreciation_coa: accumCoa,
        depreciation_expense_coa: expenseCoa,
        status: "active",
        notes: `Dibuat otomatis dari PO ${order.po_no}`,
        metadata: {
          source: "purchase_order",
          poNo: order.po_no,
          purchaseLineId: line.id
        }
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        skipped += 1;
        continue;
      }
      throw new Error(`Gagal buat aset dari PO: ${error.message}`);
    }

    created += 1;
    assetIds.push(inserted.id);
    existingLineIds.add(line.id);
  }

  return { created, skipped, assetIds };
}
