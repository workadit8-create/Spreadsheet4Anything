import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_GAIN_ON_DISPOSAL_COA,
  DEFAULT_LOSS_ON_DISPOSAL_COA
} from "@/lib/assets/disposal";
import { ASSET_CATEGORIES } from "@/lib/assets/types";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { data: coaRows, error: coaErr } = await supabase
    .from("coa_accounts")
    .select("id, name, account_type, metadata")
    .eq("organization_id", auth.org.id)
    .eq("active", true)
    .order("name");

  if (coaErr) {
    return NextResponse.json({ error: coaErr.message }, { status: 500 });
  }

  const assetAccounts: string[] = [];
  const accumAccounts: string[] = [];
  const expenseAccounts: string[] = [];
  const incomeAccounts: string[] = [];

  for (const row of coaRows || []) {
    const name = String(row.name || "");
    const sub = String((row.metadata as Record<string, unknown> | null)?.sub_category || "");
    if (row.account_type === "Aset" && (sub === "Aset Tetap" || name === "Peralatan")) {
      if (name.toLowerCase().includes("akumulasi")) {
        accumAccounts.push(name);
      } else {
        assetAccounts.push(name);
      }
    }
    if (row.account_type === "Beban") {
      expenseAccounts.push(name);
    }
    if (row.account_type === "Pendapatan") {
      incomeAccounts.push(name);
    }
  }

  const defaults = {
    assetCoaAccount: assetAccounts.includes("Peralatan") ? "Peralatan" : assetAccounts[0] || "",
    accumulatedDepreciationCoa: accumAccounts.includes("Akumulasi Penyusutan Peralatan")
      ? "Akumulasi Penyusutan Peralatan"
      : accumAccounts[0] || "",
    depreciationExpenseCoa: expenseAccounts.includes("Beban Penyusutan")
      ? "Beban Penyusutan"
      : expenseAccounts.includes("Beban Administrasi")
        ? "Beban Administrasi"
        : expenseAccounts[0] || ""
  };

  const { data: purchaseOrders, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, total, status")
    .eq("organization_id", auth.org.id)
    .neq("status", "DRAFT")
    .neq("status", "VOIDED")
    .order("order_date", { ascending: false })
    .limit(50);

  const { data: kasBank, error: kasErr } = await supabase
    .from("cash_bank_accounts")
    .select("id, name, coa_account_name")
    .eq("organization_id", auth.org.id)
    .eq("active", true)
    .order("name");

  if (poErr) {
    return NextResponse.json({ error: poErr.message }, { status: 500 });
  }
  if (kasErr) {
    return NextResponse.json({ error: kasErr.message }, { status: 500 });
  }

  return NextResponse.json({
    categories: ASSET_CATEGORIES,
    assetAccounts,
    accumAccounts,
    expenseAccounts,
    defaults: {
      ...defaults,
      gainOnDisposalCoa: incomeAccounts.includes(DEFAULT_GAIN_ON_DISPOSAL_COA)
        ? DEFAULT_GAIN_ON_DISPOSAL_COA
        : incomeAccounts[0] || DEFAULT_GAIN_ON_DISPOSAL_COA,
      lossOnDisposalCoa: expenseAccounts.includes(DEFAULT_LOSS_ON_DISPOSAL_COA)
        ? DEFAULT_LOSS_ON_DISPOSAL_COA
        : expenseAccounts[0] || DEFAULT_LOSS_ON_DISPOSAL_COA
    },
    kasBank: kasBank || [],
    purchaseOrders: (purchaseOrders || []).map((po) => ({
      id: po.id,
      poNo: po.po_no,
      orderDate: po.order_date,
      total: Number(po.total),
      status: po.status
    })),
    role: auth.role
  });
}
