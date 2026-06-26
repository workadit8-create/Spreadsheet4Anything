import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizeAsset } from "@/lib/assets/depreciation";
import type { FixedAssetRow } from "@/lib/assets/types";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

type RouteContext = { params: Promise<{ id: string }> };

function mapAsset(
  row: FixedAssetRow,
  logs: Array<{ amount: number }>
) {
  const summary = summarizeAsset(
    Number(row.acquisition_cost),
    Number(row.salvage_value),
    row.useful_life_months,
    logs
  );
  const meta = (row.metadata || {}) as Record<string, unknown>;
  const disposalRaw = meta.disposal as Record<string, unknown> | undefined;

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    acquisitionDate: row.acquisition_date,
    acquisitionCost: Number(row.acquisition_cost),
    salvageValue: Number(row.salvage_value),
    usefulLifeMonths: row.useful_life_months,
    assetCoaAccount: row.asset_coa_account,
    status: row.status,
    notes: row.notes,
    purchaseOrderId: row.purchase_order_id,
    ...summary,
    disposal: disposalRaw
      ? {
          date: String(disposalRaw.date || ""),
          proceeds: Number(disposalRaw.proceeds) || 0,
          gainLoss: Number(disposalRaw.gainLoss) || 0,
          docNo: disposalRaw.docNo ? String(disposalRaw.docNo) : null
        }
      : null
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { id } = await context.params;

  const { data: asset, error } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", auth.org.id)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!asset) {
    return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });
  }

  const { data: logs } = await supabase
    .from("asset_depreciation_logs")
    .select("amount")
    .eq("organization_id", auth.org.id)
    .eq("fixed_asset_id", id);

  return NextResponse.json({
    asset: mapAsset(asset as FixedAssetRow, logs || [])
  });
}
