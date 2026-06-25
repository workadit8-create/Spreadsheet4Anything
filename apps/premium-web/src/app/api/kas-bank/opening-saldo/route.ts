import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { computeSaldoByAccountName, type KasBankAccount } from "@/lib/posting/mutasi";
import { insertOpeningBalanceMutasi } from "@/lib/posting/linked-mutasi";
import { generateMutasiTransactionId } from "@/lib/posting/ids";

type AllocationInput = { accountId: string; amount: number };

async function journalBalanceByCoa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  coaName: string
): Promise<number> {
  const { data: lines, error } = await supabase
    .from("journal_lines")
    .select("debit, credit")
    .eq("organization_id", organizationId)
    .eq("account_name", coaName);

  if (error) throw new Error(error.message);

  let total = 0;
  for (const line of lines || []) {
    total += Number(line.debit) || 0;
    total -= Number(line.credit) || 0;
  }
  return total;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const { data: accounts, error: accErr } = await supabase
    .from("cash_bank_accounts")
    .select("id, code, name, coa_account_name, active")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("name");

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

  const { data: transfers, error: trErr } = await supabase
    .from("cash_transfers")
    .select("*")
    .eq("organization_id", org.id);

  if (trErr) return NextResponse.json({ error: trErr.message }, { status: 500 });

  const accountList = (accounts || []) as KasBankAccount[];
  const saldo = computeSaldoByAccountName(accountList, (transfers || []) as never[]);

  const coaNames = [...new Set(accountList.map((a) => a.coa_account_name).filter(Boolean))];
  const journalByCoa: Record<string, number> = {};
  for (const name of coaNames) {
    journalByCoa[name] = await journalBalanceByCoa(supabase, org.id, name);
  }

  const allocatedByCoa: Record<string, number> = {};
  for (const name of coaNames) allocatedByCoa[name] = 0;
  for (const t of transfers || []) {
    if (t.status === "VOIDED") continue;
    const meta = (t.metadata || {}) as Record<string, unknown>;
    if (meta.opening_balance !== true) continue;
    const coa = String(t.dest_coa_name || "");
    if (coa && allocatedByCoa[coa] != null) {
      allocatedByCoa[coa] += Number(t.amount) || 0;
    }
  }

  return NextResponse.json({
    accounts: accountList.map((a) => ({
      ...a,
      saldoMutasi: saldo[a.name] || 0
    })),
    journalByCoa,
    allocatedByCoa
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const body = await request.json();
  const transferDate = String(body.transferDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const allocations = (body.allocations || []) as AllocationInput[];

  if (!allocations.length) {
    return NextResponse.json({ error: "Isi alokasi minimal satu rekening" }, { status: 400 });
  }

  const { data: accounts, error: accErr } = await supabase
    .from("cash_bank_accounts")
    .select("id, name, coa_account_name, active")
    .eq("organization_id", org.id)
    .eq("active", true);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

  const byId = new Map((accounts || []).map((a) => [a.id, a]));
  const newByCoa: Record<string, number> = {};

  for (const row of allocations) {
    const amount = Number(row.amount) || 0;
    if (amount <= 0) continue;
    const acc = byId.get(row.accountId);
    if (!acc) {
      return NextResponse.json({ error: "Rekening tidak ditemukan" }, { status: 400 });
    }
    newByCoa[acc.coa_account_name] = (newByCoa[acc.coa_account_name] || 0) + amount;
  }

  for (const [coaName, addAmount] of Object.entries(newByCoa)) {
    const journalBal = await journalBalanceByCoa(supabase, org.id, coaName);
    if (journalBal <= 0) {
      return NextResponse.json(
        { error: `Akun COA "${coaName}" tidak punya saldo jurnal — input dulu di Jurnal Manual` },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("cash_transfers")
      .select("amount, dest_coa_name, status, metadata")
      .eq("organization_id", org.id)
      .eq("metadata->>opening_balance", "true");

    let already = 0;
    for (const t of existing || []) {
      if (t.status === "VOIDED") continue;
      if (t.dest_coa_name === coaName) already += Number(t.amount) || 0;
    }

    if (already + addAmount > journalBal + 0.01) {
      return NextResponse.json(
        {
          error: `Alokasi ${coaName} melebihi saldo jurnal (${formatIdr(journalBal)}). Sudah dialokasi: ${formatIdr(already)}`
        },
        { status: 400 }
      );
    }
  }

  let inserted = 0;
  try {
    for (const row of allocations) {
      const amount = Number(row.amount) || 0;
      if (amount <= 0) continue;
      const acc = byId.get(row.accountId);
      if (!acc) continue;

      await insertOpeningBalanceMutasi(supabase, {
        organizationId: org.id,
        transferDate,
        account: acc,
        amount,
        keterangan: `Saldo awal rekening — ${acc.name}`,
        transactionId: generateMutasiTransactionId()
      });
      inserted++;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal alokasi saldo awal";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted });
}

function formatIdr(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}
