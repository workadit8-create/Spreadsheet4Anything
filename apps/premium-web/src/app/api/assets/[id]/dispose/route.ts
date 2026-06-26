import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizeAsset } from "@/lib/assets/depreciation";
import type { FixedAssetRow } from "@/lib/assets/types";
import {
  assetDisposalDocNo,
  assetDisposalTransactionId,
  postAssetDisposal
} from "@/lib/posting/asset-disposal";
import { resolveKasBankAccount } from "@/lib/posting/linked-mutasi";
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

  const disposalDate = String(body.disposalDate || "").trim();
  if (!disposalDate) {
    return NextResponse.json({ error: "Tanggal disposal wajib diisi" }, { status: 400 });
  }

  const proceeds = Math.max(0, Number(body.proceeds) || 0);
  const rekening = String(body.rekening || "").trim();
  const notes = body.notes ? String(body.notes).trim() || undefined : undefined;

  if (proceeds > 0 && !rekening) {
    return NextResponse.json(
      { error: "Pilih rekening Kas/Bank jika ada hasil penjualan" },
      { status: 400 }
    );
  }

  const { data: depLogs, error: logErr } = await supabase
    .from("asset_depreciation_logs")
    .select("amount")
    .eq("organization_id", auth.org.id)
    .eq("fixed_asset_id", id);

  if (logErr) {
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  const row = asset as FixedAssetRow;
  const summary = summarizeAsset(
    Number(row.acquisition_cost),
    Number(row.salvage_value),
    row.useful_life_months,
    depLogs || []
  );

  let proceedsAccount = null;
  let proceedsCoa: string | undefined;

  if (proceeds > 0) {
    const { data: kasAccounts, error: kasErr } = await supabase
      .from("cash_bank_accounts")
      .select("id, name, coa_account_name")
      .eq("organization_id", auth.org.id)
      .eq("active", true);

    if (kasErr) {
      return NextResponse.json({ error: kasErr.message }, { status: 500 });
    }

    proceedsAccount = resolveKasBankAccount(rekening, kasAccounts || []);
    if (!proceedsAccount) {
      return NextResponse.json({ error: "Rekening Kas/Bank tidak ditemukan" }, { status: 400 });
    }
    proceedsCoa = proceedsAccount.coa_account_name;
  }

  const transactionId = assetDisposalTransactionId(id);
  const docNo = assetDisposalDocNo(row.code, disposalDate);

  let journalEntryId: string;
  let disposalAmounts;
  try {
    const posted = await postAssetDisposal(supabase, {
      organizationId: auth.org.id,
      fixedAssetId: id,
      assetName: row.name,
      assetCode: row.code,
      entryDate: disposalDate,
      acquisitionCost: Number(row.acquisition_cost),
      totalDepreciated: summary.totalDepreciated,
      salvageValue: Number(row.salvage_value),
      proceeds,
      proceedsCoa,
      proceedsAccount,
      assetCoa: row.asset_coa_account,
      accumCoa: row.accumulated_depreciation_coa,
      transactionId,
      docNo,
      notes
    });
    journalEntryId = posted.entryId;
    disposalAmounts = posted.amounts;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal posting jurnal disposal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const disposalMeta = {
    date: disposalDate,
    proceeds,
    rekening: rekening || null,
    proceedsCoa: proceedsCoa || null,
    bookValue: disposalAmounts.bookValue,
    gainLoss: disposalAmounts.gainLoss,
    journalEntryId,
    docNo,
    notes: notes || null
  };

  const { error: updateErr } = await supabase
    .from("fixed_assets")
    .update({
      status: "disposed",
      updated_at: new Date().toISOString(),
      metadata: {
        ...(row.metadata || {}),
        disposal: disposalMeta
      }
    })
    .eq("id", id)
    .eq("organization_id", auth.org.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: "disposed",
    docNo,
    disposal: disposalMeta,
    summary
  });
}
