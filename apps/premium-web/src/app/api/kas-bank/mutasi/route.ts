import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import {
  validateMutasiInput,
  type CreateMutasiInput,
  type KasBankAccount
} from "@/lib/posting/mutasi";
import { computeFullKasSaldo } from "@/lib/posting/kas-saldo";
import type { PurchaseLineRow, SalesLineRow } from "@/lib/posting/types";
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

  let query = supabase
    .from("cash_transfers")
    .select("*")
    .eq("organization_id", org.id)
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (start) query = query.gte("transfer_date", start);
  if (end) query = query.lte("transfer_date", end);

  const [
    { data: transfers, error: trErr },
    { data: allTransfers },
    { data: purchaseOrders },
    { data: purchaseLines },
    { data: salesOrders },
    { data: salesLines },
    { data: payments }
  ] = await Promise.all([
    query,
    supabase
      .from("cash_transfers")
      .select("*")
      .eq("organization_id", org.id),
    supabase
      .from("purchase_orders")
      .select("id, status, metadata")
      .eq("organization_id", org.id)
      .neq("status", "DRAFT"),
    supabase.from("purchase_lines").select("*"),
    supabase
      .from("sales_orders")
      .select("id, status, metadata")
      .eq("organization_id", org.id)
      .neq("status", "DRAFT"),
    supabase.from("sales_lines").select("*"),
    supabase
      .from("payments")
      .select("doc_type, doc_id, amount, status, method, metadata")
      .eq("organization_id", org.id)
      .in("doc_type", ["UTANG_PAYMENT", "PIUTANG_PAYMENT"])
  ]);

  if (trErr) return NextResponse.json({ error: trErr.message }, { status: 500 });

  const purchaseLinesByOrder = new Map<string, PurchaseLineRow[]>();
  for (const line of purchaseLines || []) {
    const bucket = purchaseLinesByOrder.get(line.purchase_order_id) || [];
    bucket.push(line as PurchaseLineRow);
    purchaseLinesByOrder.set(line.purchase_order_id, bucket);
  }

  const salesLinesByOrder = new Map<string, SalesLineRow[]>();
  for (const line of salesLines || []) {
    const bucket = salesLinesByOrder.get(line.sales_order_id) || [];
    bucket.push(line as SalesLineRow);
    salesLinesByOrder.set(line.sales_order_id, bucket);
  }

  const purchaseWithLines = (purchaseOrders || []).map((o) => ({
    id: o.id,
    status: o.status,
    metadata: (o.metadata || {}) as Record<string, unknown>,
    lines: purchaseLinesByOrder.get(o.id) || []
  }));

  const salesWithLines = (salesOrders || []).map((o) => ({
    id: o.id,
    status: o.status,
    metadata: (o.metadata || {}) as Record<string, unknown>,
    lines: salesLinesByOrder.get(o.id) || []
  }));

  const accountList = (accounts || []) as KasBankAccount[];
  const saldo = computeFullKasSaldo(
    accountList,
    (allTransfers || []) as never[],
    purchaseWithLines,
    salesWithLines,
    payments || []
  );

  const { data: coaRows } = await supabase
    .from("coa_accounts")
    .select("id, code, name, account_type")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("code");

  const items = (transfers || []).map((t) => ({
    id: t.id,
    transferNo: t.transfer_no,
    transferDate: t.transfer_date,
    kind: t.kind,
    sourceAccountName: t.source_account_name || "",
    destAccountName: t.dest_account_name || "",
    amount: Number(t.amount) || 0,
    keterangan: t.keterangan || "",
    status: t.status,
    transactionId: t.transaction_id
  }));

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
