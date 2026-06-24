import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";

export async function GET() {
  const supabase = await createClient();
  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const { data, error } = await supabase
    .from("cash_bank_accounts")
    .select("id, code, name, coa_account_name, active, created_at")
    .eq("organization_id", org.id)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Nama rekening wajib" }, { status: 400 });

  const coaAccountName = String(body.coa_account_name || "").trim();
  if (!coaAccountName) {
    return NextResponse.json({ error: "Akun COA wajib dipilih" }, { status: 400 });
  }

  const row = {
    organization_id: org.id,
    code: String(body.code || "").trim() || null,
    name,
    coa_account_name: coaAccountName,
    active: body.active !== false
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
