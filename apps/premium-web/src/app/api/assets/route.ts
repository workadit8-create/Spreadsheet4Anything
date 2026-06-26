import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizeAsset } from "@/lib/assets/depreciation";
import type { FixedAssetRow } from "@/lib/assets/types";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

function mapAssetRow(
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
  const disposal = disposalRaw
    ? {
        date: String(disposalRaw.date || ""),
        proceeds: Number(disposalRaw.proceeds) || 0,
        gainLoss: Number(disposalRaw.gainLoss) || 0,
        docNo: disposalRaw.docNo ? String(disposalRaw.docNo) : null
      }
    : null;

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
    accumulatedDepreciationCoa: row.accumulated_depreciation_coa,
    depreciationExpenseCoa: row.depreciation_expense_coa,
    status: row.status,
    purchaseOrderId: row.purchase_order_id,
    notes: row.notes,
    disposal,
    ...summary,
    depreciationLogCount: logs.length
  };
}

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { data: assets, error } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", auth.org.id)
    .order("acquisition_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const assetIds = (assets || []).map((a) => a.id);
  const logsByAsset = new Map<string, Array<{ amount: number }>>();

  if (assetIds.length) {
    const { data: logs, error: logErr } = await supabase
      .from("asset_depreciation_logs")
      .select("fixed_asset_id, amount")
      .eq("organization_id", auth.org.id)
      .in("fixed_asset_id", assetIds);

    if (logErr) {
      return NextResponse.json({ error: logErr.message }, { status: 500 });
    }

    for (const log of logs || []) {
      const list = logsByAsset.get(log.fixed_asset_id) || [];
      list.push({ amount: Number(log.amount) });
      logsByAsset.set(log.fixed_asset_id, list);
    }
  }

  const items = (assets || []).map((row) =>
    mapAssetRow(row as FixedAssetRow, logsByAsset.get(row.id) || [])
  );

  return NextResponse.json({ assets: items, role: auth.role });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const acquisitionDate = String(body.acquisitionDate || "").trim();
  const acquisitionCost = Number(body.acquisitionCost);
  const salvageValue = Number(body.salvageValue) || 0;
  const usefulLifeMonths = Number(body.usefulLifeMonths);
  const assetCoaAccount = String(body.assetCoaAccount || "").trim();
  const accumulatedDepreciationCoa = String(body.accumulatedDepreciationCoa || "").trim();
  const depreciationExpenseCoa = String(body.depreciationExpenseCoa || "").trim();

  if (!name) return NextResponse.json({ error: "Nama aset wajib diisi" }, { status: 400 });
  if (!acquisitionDate) {
    return NextResponse.json({ error: "Tanggal perolehan wajib diisi" }, { status: 400 });
  }
  if (!Number.isFinite(acquisitionCost) || acquisitionCost < 0) {
    return NextResponse.json({ error: "Nilai perolehan tidak valid" }, { status: 400 });
  }
  if (!Number.isFinite(usefulLifeMonths) || usefulLifeMonths <= 0) {
    return NextResponse.json({ error: "Umur ekonomis (bulan) wajib diisi" }, { status: 400 });
  }
  if (!assetCoaAccount || !accumulatedDepreciationCoa || !depreciationExpenseCoa) {
    return NextResponse.json({ error: "Akun aset, akumulasi, dan beban penyusutan wajib dipilih" }, { status: 400 });
  }
  if (salvageValue < 0 || salvageValue > acquisitionCost) {
    return NextResponse.json({ error: "Nilai residu tidak valid" }, { status: 400 });
  }

  const purchaseOrderId = body.purchaseOrderId ? String(body.purchaseOrderId) : null;
  const code = body.code ? String(body.code).trim() || null : null;
  const category = String(body.category || "Peralatan").trim() || "Peralatan";
  const notes = body.notes ? String(body.notes).trim() || null : null;

  const { data: inserted, error } = await supabase
    .from("fixed_assets")
    .insert({
      organization_id: auth.org.id,
      code,
      name,
      category,
      acquisition_date: acquisitionDate,
      acquisition_cost: acquisitionCost,
      salvage_value: salvageValue,
      useful_life_months: usefulLifeMonths,
      asset_coa_account: assetCoaAccount,
      accumulated_depreciation_coa: accumulatedDepreciationCoa,
      depreciation_expense_coa: depreciationExpenseCoa,
      purchase_order_id: purchaseOrderId,
      notes,
      status: "active"
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = summarizeAsset(
    acquisitionCost,
    salvageValue,
    usefulLifeMonths,
    []
  );

  return NextResponse.json({
    asset: mapAssetRow(inserted as FixedAssetRow, []),
    summary
  });
}
