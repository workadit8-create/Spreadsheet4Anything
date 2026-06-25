import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const { data, error } = await supabase
    .from("cash_bank_accounts")
    .select("id, code, name, coa_account_name, active, metadata, created_at")
    .eq("organization_id", org.id)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
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
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Nama rekening wajib" }, { status: 400 });

  const coaAccountName = String(body.coa_account_name || "").trim();
  if (!coaAccountName) {
    return NextResponse.json({ error: "Akun COA wajib dipilih" }, { status: 400 });
  }

  const metadata =
    body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Record<string, unknown>)
      : {};

  const row = {
    organization_id: org.id,
    code: String(body.code || "").trim() || null,
    name,
    coa_account_name: coaAccountName,
    active: body.active !== false,
    metadata
  };

  if (body.id) {
    const { data, error } = await supabase
      .from("cash_bank_accounts")
      .update(row)
      .eq("id", body.id)
      .eq("organization_id", org.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  const { data, error } = await supabase.from("cash_bank_accounts").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
