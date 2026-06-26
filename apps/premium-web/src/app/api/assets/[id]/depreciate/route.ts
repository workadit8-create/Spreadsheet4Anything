import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nextDepreciationAmount, summarizeAsset } from "@/lib/assets/depreciation";
import type { FixedAssetRow } from "@/lib/assets/types";
import {
  assetDepreciationDocNo,
  assetDepreciationTransactionId,
  postAssetDepreciation
} from "@/lib/posting/asset-depreciation";
import {
  requirePostingRole,
  requireUserOrg,
  toOrgAuthResponse
} from "@/lib/org/require-user-org";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  try {
    requirePostingRole(auth.role);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { id } = await context.params;

  const { data: asset, error: assetErr } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", auth.org.id)
    .eq("id", id)
    .maybeSingle();

  if (assetErr) {
    return NextResponse.json({ error: assetErr.message }, { status: 500 });
  }
  if (!asset) {
    return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });
  }

  if (asset.status === "disposed") {
    return NextResponse.json({ error: "Aset sudah di-dispose" }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const periodDate = String(body.periodDate || "").trim();
  if (!periodDate) {
    return NextResponse.json({ error: "Tanggal periode wajib diisi" }, { status: 400 });
  }

  const { data: existingLogs, error: logErr } = await supabase
    .from("asset_depreciation_logs")
    .select("amount, period_date")
    .eq("organization_id", auth.org.id)
    .eq("fixed_asset_id", id);

  if (logErr) {
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  const duplicatePeriod = (existingLogs || []).some((l) => l.period_date === periodDate);
  if (duplicatePeriod) {
    return NextResponse.json(
      { error: `Penyusutan periode ${periodDate} sudah dicatat` },
      { status: 400 }
    );
  }

  const row = asset as FixedAssetRow;
  const summary = summarizeAsset(
    Number(row.acquisition_cost),
    Number(row.salvage_value),
    row.useful_life_months,
    existingLogs || []
  );

  const requestedAmount = body.amount != null ? Number(body.amount) : undefined;
  const amount = nextDepreciationAmount(summary, requestedAmount);

  if (amount <= 0) {
    return NextResponse.json(
      { error: "Tidak ada sisa penyusutan untuk dicatat" },
      { status: 400 }
    );
  }

  const transactionId = assetDepreciationTransactionId(id, periodDate);
  const docNo = assetDepreciationDocNo(row.code, periodDate);
  const notes = body.notes ? String(body.notes).trim() || undefined : undefined;

  let journalEntryId: string;
  try {
    const posted = await postAssetDepreciation(supabase, {
      organizationId: auth.org.id,
      fixedAssetId: id,
      assetName: row.name,
      entryDate: periodDate,
      amount,
      expenseCoa: row.depreciation_expense_coa,
      accumCoa: row.accumulated_depreciation_coa,
      transactionId,
      docNo,
      notes
    });
    journalEntryId = posted.entryId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal posting jurnal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: logRow, error: insertErr } = await supabase
    .from("asset_depreciation_logs")
    .insert({
      organization_id: auth.org.id,
      fixed_asset_id: id,
      period_date: periodDate,
      amount,
      journal_entry_id: journalEntryId,
      notes: notes || null
    })
    .select("*")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const allLogs = [...(existingLogs || []), { amount }];
  const newSummary = summarizeAsset(
    Number(row.acquisition_cost),
    Number(row.salvage_value),
    row.useful_life_months,
    allLogs
  );

  let newStatus = row.status;
  if (newSummary.remainingDepreciable <= 0) {
    newStatus = "fully_depreciated";
    await supabase
      .from("fixed_assets")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", auth.org.id);
  }

  return NextResponse.json({
    log: {
      id: logRow.id,
      periodDate: logRow.period_date,
      amount: Number(logRow.amount),
      journalEntryId: logRow.journal_entry_id
    },
    summary: newSummary,
    status: newStatus,
    docNo
  });
}
