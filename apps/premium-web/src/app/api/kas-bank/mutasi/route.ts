import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import {
  computeSaldoByAccountName,
  validateMutasiInput,
  type CreateMutasiInput,
  type KasBankAccount
} from "@/lib/posting/mutasi";
import { isLinkedCashTransfer, isOpeningBalanceTransfer } from "@/lib/posting/linked-mutasi";
import { generateMutasiTransactionId, generateMutasiTransferNo } from "@/lib/posting/ids";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const { data: accounts, error: accErr } = await supabase
    .from("cash_bank_accounts")
    .select("id, code, name, coa_account_name, active")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("name");

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

  let historyQuery = supabase
    .from("cash_transfers")
    .select("*")
    .eq("organization_id", org.id)
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (start) historyQuery = historyQuery.gte("transfer_date", start);
  if (end) historyQuery = historyQuery.lte("transfer_date", end);

  const saldoColumns =
    "kind, amount, source_account_name, dest_account_name, status, metadata";

  const [{ data: historyTransfers, error: trErr }, { data: allTransfers }] = await Promise.all([
    historyQuery,
    supabase
      .from("cash_transfers")
      .select(saldoColumns)
      .eq("organization_id", org.id)
  ]);

  if (trErr) return NextResponse.json({ error: trErr.message }, { status: 500 });

  const { data: coaRows } = await supabase
    .from("coa_accounts")
    .select("id, code, name, account_type")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("code");

  const accountList = (accounts || []) as KasBankAccount[];
  const saldo = computeSaldoByAccountName(accountList, (allTransfers || []) as never[]);

  const items = (historyTransfers || []).map((t) => {
    const meta = (t.metadata || {}) as Record<string, unknown>;
    return {
      id: t.id,
      transferNo: t.transfer_no,
      transferDate: t.transfer_date,
      kind: t.kind,
      sourceAccountName: t.source_account_name || "",
      destAccountName: t.dest_account_name || "",
      amount: Number(t.amount) || 0,
      keterangan: t.keterangan || "",
      status: t.status,
      linked: isLinkedCashTransfer(meta),
      openingBalance: isOpeningBalanceTransfer(meta),
      transactionId: t.transaction_id
    };
  });

  return NextResponse.json({
    items,
    saldo,
    accounts: accountList,
    coaAccounts: coaRows || []
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const body = (await request.json()) as CreateMutasiInput;

  const { data: accounts, error: accErr } = await supabase
    .from("cash_bank_accounts")
    .select("id, name, coa_account_name, active")
    .eq("organization_id", org.id)
    .eq("active", true);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

  try {
    const { source, dest, contraCoa } = validateMutasiInput(body, (accounts || []) as KasBankAccount[]);
    const transferNo = generateMutasiTransferNo();
    const transactionId = generateMutasiTransactionId();

    const row = {
      organization_id: org.id,
      transfer_no: transferNo,
      transfer_date: body.transfer_date,
      kind: body.kind,
      source_account_id: source?.id || null,
      source_account_name: source?.name || null,
      source_coa_name: source?.coa_account_name || null,
      dest_account_id: dest?.id || null,
      dest_account_name: dest?.name || null,
      dest_coa_name: dest?.coa_account_name || null,
      contra_coa_name: contraCoa,
      amount: Number(body.amount),
      keterangan: String(body.keterangan || "").trim() || null,
      transaction_id: transactionId,
      status: "CONFIRMED"
    };

    const { data: transfer, error: insErr } = await supabase
      .from("cash_transfers")
      .insert(row)
      .select("id, transfer_no, status")
      .single();

    if (insErr || !transfer) {
      return NextResponse.json({ error: insErr?.message || "Gagal simpan mutasi" }, { status: 500 });
    }

    return NextResponse.json({
      transfer,
      message: "Mutasi disimpan (CONFIRMED). Post jurnal untuk catat ke buku besar."
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal simpan mutasi" },
      { status: 400 }
    );
  }
}
