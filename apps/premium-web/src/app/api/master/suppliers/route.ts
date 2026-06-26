import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMasterEntityRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { mergeSupplierMetadata, supplierPkpFromMetadata } from "@/lib/suppliers/pkp";

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
    .from("suppliers")
    .select("id, code, name, phone, email, active, metadata, created_at")
    .eq("organization_id", org.id)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data || []).map((s) => ({
    ...s,
    pkp: supplierPkpFromMetadata((s.metadata || {}) as Record<string, unknown>)
  }));

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requireMasterEntityRole(auth.role, "supplier");
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Nama wajib" }, { status: 400 });

  let existingMeta: Record<string, unknown> = {};
  if (body.id) {
    const { data: existingRow } = await supabase
      .from("suppliers")
      .select("metadata")
      .eq("id", body.id)
      .eq("organization_id", org.id)
      .maybeSingle();
    existingMeta = (existingRow?.metadata || {}) as Record<string, unknown>;
  }

  const metadata = mergeSupplierMetadata(existingMeta, {
    pkp: body.pkp === true
  });

  const row = {
    organization_id: org.id,
    code: String(body.code || "").trim() || null,
    name,
    phone: String(body.phone || "").trim() || null,
    email: String(body.email || "").trim().toLowerCase() || null,
    active: body.active !== false,
    metadata
  };

  if (body.id) {
    const { data, error } = await supabase
      .from("suppliers")
      .update(row)
      .eq("id", body.id)
      .eq("organization_id", org.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      item: {
        ...data,
        pkp: supplierPkpFromMetadata((data.metadata || {}) as Record<string, unknown>)
      }
    });
  }

  const { data, error } = await supabase.from("suppliers").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    item: {
      ...data,
      pkp: supplierPkpFromMetadata((data.metadata || {}) as Record<string, unknown>)
    }
  });
}
