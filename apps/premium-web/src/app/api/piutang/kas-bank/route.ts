import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const { data, error } = await supabase
    .from("cash_bank_accounts")
    .select("id, code, name, coa_account_name")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}
