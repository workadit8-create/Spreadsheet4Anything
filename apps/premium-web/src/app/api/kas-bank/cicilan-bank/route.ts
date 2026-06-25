import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { ensureDefaultCoa } from "@/lib/coa/seed-default-coa";
import { postCicilanBankPayment, validateCicilanBankInput } from "@/lib/posting/cicilan-bank";
import { generateCicilanBankDocNo, generateCicilanBankTransactionId } from "@/lib/posting/ids";
import { subCategoryForCoa } from "@/lib/laporan/coa";
import type { CoaAccount } from "@/lib/laporan/types";

function coaAsAccount(row: {
  id: string;
  code: string;
  name: string;
  account_type: string;
  metadata: Record<string, unknown>;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    account_type: row.account_type,
    metadata: row.metadata || {}
  } as CoaAccount;
}

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  await ensureDefaultCoa(supabase, org.id);

  const [accRes, coaRes, histRes] = await Promise.all([
    supabase
      .from("cash_bank_accounts")
      .select("id, name, coa_account_name")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("coa_accounts")
      .select("id, code, name, account_type, metadata")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("code"),
    supabase
      .from("journal_entries")
      .select(
        "id, doc_no, entry_date, transaction_id, metadata, created_at, journal_lines(account_name, debit, credit, keterangan, sort_order)"
      )
      .eq("organization_id", org.id)
      .eq("modul", "CICILAN_UTANG_BANK")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  if (accRes.error) return NextResponse.json({ error: accRes.error.message }, { status: 500 });
  if (coaRes.error) return NextResponse.json({ error: coaRes.error.message }, { status: 500 });
  if (histRes.error) return NextResponse.json({ error: histRes.error.message }, { status: 500 });

  const coaRows = (coaRes.data || []).map((r) =>
    coaAsAccount({ ...r, metadata: (r.metadata || {}) as Record<string, unknown> })
  );

  const utangAccounts = coaRows.filter(
    (c) => c.account_type === "Kewajiban" && subCategoryForCoa(c) === "Kewajiban Jangka Panjang"
  );
  const bebanAccounts = coaRows.filter((c) => c.account_type === "Beban");

  return NextResponse.json({
    accounts: accRes.data || [],
    utangAccounts,
    bebanAccounts,
    defaultUtang: utangAccounts.find((c) => c.name === "Utang Bank Jangka Panjang")?.name || utangAccounts[0]?.name || "",
    defaultBeban:
      bebanAccounts.find((c) => c.name === "Beban Administrasi")?.name ||
      bebanAccounts.find((c) => c.name === "Beban Lain-lain")?.name ||
      bebanAccounts[0]?.name ||
      "",
    history: histRes.data || []
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const body = await request.json();
  const entryDate = String(body.entryDate || "").slice(0, 10);
  const accountId = String(body.accountId || "");
  const utangAccountName = String(body.utangAccountName || "").trim();
  const bebanAccountName = String(body.bebanAccountName || "").trim();
  const pokok = Number(body.pokok) || 0;
  const bunga = Number(body.bunga) || 0;
  const keterangan = String(body.keterangan || "Cicilan pinjaman bank").trim();

  if (!entryDate) {
    return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 });
  }

  const validation = validateCicilanBankInput({
    accountId,
    utangAccountName,
    bebanAccountName,
    pokok,
    bunga
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { data: account, error: accErr } = await supabase
    .from("cash_bank_accounts")
    .select("id, name, coa_account_name")
    .eq("organization_id", org.id)
    .eq("id", accountId)
    .maybeSingle();

  if (accErr || !account) {
    return NextResponse.json({ error: "Rekening tidak ditemukan" }, { status: 400 });
  }

  try {
    const transactionId = generateCicilanBankTransactionId();
    const docNo = generateCicilanBankDocNo();

    const result = await postCicilanBankPayment(supabase, {
      organizationId: org.id,
      entryDate,
      account,
      utangAccountName,
      bebanAccountName,
      pokok,
      bunga,
      keterangan,
      transactionId,
      docNo
    });

    return NextResponse.json({
      ok: true,
      entryId: result.entryId,
      docNo,
      transactionId,
      total: result.total,
      message: `Cicilan ${docNo} tercatat (pokok + bunga + mutasi rekening).`
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal simpan cicilan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
