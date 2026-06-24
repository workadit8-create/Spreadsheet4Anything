import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";

export async function GET() {
  const supabase = await createClient();
  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const { data, error } = await supabase
    .from("units")
    .select("id, code, name")
    .eq("organization_id", org.id)
    .order("code");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const body = await request.json();
  const code = String(body.code || "").trim().toUpperCase();
  const name = String(body.name || "").trim();

  if (!code) return NextResponse.json({ error: "Kode satuan wajib" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nama satuan wajib" }, { status: 400 });

  const row = {
    organization_id: org.id,
    code,
    name
  };

  if (body.id) {
    const { data, error } = await supabase
      .from("units")
      .update(row)
      .eq("id", body.id)
      .eq("organization_id", org.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  const { data, error } = await supabase.from("units").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
