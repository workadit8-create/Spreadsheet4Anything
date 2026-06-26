import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeAsset } from "@/lib/assets/depreciation";
import type { FixedAssetRow } from "@/lib/assets/types";
import { buildNeraca } from "./neraca";
import type { CoaAccount, JournalLineRow, ReportPeriod } from "./types";

export type AssetRegisterStatusFilter = "all" | "active" | "disposed";

export type AssetRegisterRow = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  totalDepreciated: number;
  bookValue: number;
  status: string;
  statusLabel: string;
  assetCoaAccount: string;
};

export type AssetRegisterReport = {
  period: ReportPeriod;
  statusFilter: AssetRegisterStatusFilter;
  rows: AssetRegisterRow[];
  totals: {
    count: number;
    acquisitionCost: number;
    totalDepreciated: number;
    bookValue: number;
    activeCount: number;
    activeBookValue: number;
  };
  reconciliation: {
    registerActiveBookValue: number;
    neracaAsetTetap: number;
    selisih: number;
  };
};

function statusLabel(status: string): string {
  if (status === "fully_depreciated") return "Penuh disusutkan";
  if (status === "disposed") return "Dispose";
  return "Aktif";
}

function disposalDateFromMeta(metadata: Record<string, unknown>): string | null {
  const disposal = metadata.disposal as Record<string, unknown> | undefined;
  if (!disposal?.date) return null;
  return String(disposal.date).slice(0, 10);
}

function effectiveStatusAtEnd(
  row: FixedAssetRow,
  asOfEnd: string,
  remainingDepreciable: number
): string {
  const disposedOn = disposalDateFromMeta((row.metadata || {}) as Record<string, unknown>);
  if (disposedOn && disposedOn <= asOfEnd) return "disposed";
  if (remainingDepreciable <= 0 && Number(row.acquisition_cost) > 0) return "fully_depreciated";
  return "active";
}

export async function buildAssetRegisterReport(
  supabase: SupabaseClient,
  organizationId: string,
  period: ReportPeriod,
  statusFilter: AssetRegisterStatusFilter,
  coa: CoaAccount[],
  journalLines: JournalLineRow[]
): Promise<AssetRegisterReport> {
  const { data: assets, error: assetErr } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .lte("acquisition_date", period.end)
    .order("acquisition_date", { ascending: true });

  if (assetErr) throw new Error(assetErr.message);

  const assetIds = (assets || []).map((a) => a.id);
  const logsByAsset = new Map<string, Array<{ amount: number; period_date: string }>>();

  if (assetIds.length) {
    const { data: logs, error: logErr } = await supabase
      .from("asset_depreciation_logs")
      .select("fixed_asset_id, amount, period_date")
      .eq("organization_id", organizationId)
      .in("fixed_asset_id", assetIds)
      .lte("period_date", period.end);

    if (logErr) throw new Error(logErr.message);

    for (const log of logs || []) {
      const list = logsByAsset.get(log.fixed_asset_id) || [];
      list.push({ amount: Number(log.amount), period_date: log.period_date });
      logsByAsset.set(log.fixed_asset_id, list);
    }
  }

  const rows: AssetRegisterRow[] = [];

  for (const raw of assets || []) {
    const row = raw as FixedAssetRow;
    const logs = logsByAsset.get(row.id) || [];
    const summary = summarizeAsset(
      Number(row.acquisition_cost),
      Number(row.salvage_value),
      row.useful_life_months,
      logs
    );
    const status = effectiveStatusAtEnd(row, period.end, summary.remainingDepreciable);

    if (statusFilter === "active" && status === "disposed") continue;
    if (statusFilter === "disposed" && status !== "disposed") continue;

    rows.push({
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      acquisitionDate: row.acquisition_date,
      acquisitionCost: Number(row.acquisition_cost),
      totalDepreciated: summary.totalDepreciated,
      bookValue: status === "disposed" ? 0 : summary.bookValue,
      status,
      statusLabel: statusLabel(status),
      assetCoaAccount: row.asset_coa_account
    });
  }

  const activeRows = rows.filter((r) => r.status !== "disposed");
  const totals = {
    count: rows.length,
    acquisitionCost: rows.reduce((s, r) => s + r.acquisitionCost, 0),
    totalDepreciated: rows.reduce((s, r) => s + r.totalDepreciated, 0),
    bookValue: rows.reduce((s, r) => s + r.bookValue, 0),
    activeCount: activeRows.length,
    activeBookValue: activeRows.reduce((s, r) => s + r.bookValue, 0)
  };

  const neraca = buildNeraca(coa, journalLines, period);
  const registerActiveBookValue = totals.activeBookValue;
  const neracaAsetTetap = neraca.asetTetap.subtotal;
  const selisih = registerActiveBookValue - neracaAsetTetap;

  return {
    period,
    statusFilter,
    rows,
    totals,
    reconciliation: {
      registerActiveBookValue,
      neracaAsetTetap,
      selisih
    }
  };
}
