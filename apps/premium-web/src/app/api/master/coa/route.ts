import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { ensureDefaultCoa } from "@/lib/coa/seed-default-coa";

const ACCOUNT_TYPES = ["Aset", "Kewajiban", "Ekuitas", "Pendapatan", "Beban"] as const;

function formatCoaError(message: string, code: string): string {
  if (message.includes("coa_accounts_organization_id_code_key") || message.includes("duplicate key")) {
    return `Kode akun "${code}" sudah dipakai. Gunakan kode lain (mis. 5-10002).`;
  }
  return message;
}

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  try {
    await ensureDefaultCoa(supabase, org.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal mengisi COA default";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("coa_accounts")
    .select("id, code, name, account_type, active, metadata, created_at")
    .eq("organization_id", org.id)
    .order("code");

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
  const code = String(body.code || "").trim();
  const name = String(body.name || "").trim();
  const accountType = String(body.account_type || "").trim();

  if (!code) return NextResponse.json({ error: "Kode akun wajib" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nama akun wajib" }, { status: 400 });
  if (!ACCOUNT_TYPES.includes(accountType as typeof ACCOUNT_TYPES[number])) {
    return NextResponse.json({ error: "Tipe akun tidak valid" }, { status: 400 });
  }

  const row = {
    organization_id: org.id,
    code,
    name,
    account_type: accountType,
    active: body.active !== false
  };

  if (body.id) {
    const { data, error } = await supabase
      .from("coa_accounts")
      .update(row)
      .eq("id", body.id)
      .eq("organization_id", org.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: formatCoaError(error.message, code) }, { status: 400 });
    }
    return NextResponse.json({ item: data });
  }

  const { data, error } = await supabase.from("coa_accounts").insert(row).select().single();
  if (error) {
    return NextResponse.json({ error: formatCoaError(error.message, code) }, { status: 400 });
  }
  return NextResponse.json({ item: data });
}
