export const ASSET_CATEGORIES = [
  "Peralatan",
  "Kendaraan",
  "Mesin",
  "Gedung",
  "Lainnya"
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export type FixedAssetStatus = "active" | "disposed" | "fully_depreciated";

export type FixedAssetRow = {
  id: string;
  organization_id: string;
  code: string | null;
  name: string;
  category: string;
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life_months: number;
  asset_coa_account: string;
  accumulated_depreciation_coa: string;
  depreciation_expense_coa: string;
  status: FixedAssetStatus;
  purchase_order_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AssetDepreciationLogRow = {
  id: string;
  fixed_asset_id: string;
  period_date: string;
  amount: number;
  journal_entry_id: string | null;
  notes: string | null;
  created_at: string;
};

export type AssetSummary = {
  monthlyDepreciation: number;
  totalDepreciated: number;
  bookValue: number;
  depreciableBase: number;
  remainingDepreciable: number;
};
