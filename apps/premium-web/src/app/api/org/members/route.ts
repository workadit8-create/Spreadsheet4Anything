import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addOrgMember, isInvitableRole, listOrgMembers } from "@/lib/org/members";
import { requireOwnerRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requireOwnerRole(auth.role);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  try {
    const members = await listOrgMembers(supabase, auth.org.id);
    return NextResponse.json({ members });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal memuat anggota";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requireOwnerRole(auth.role);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  let body: { email?: string; role?: string; fullName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  const role = String(body.role ?? "").trim().toLowerCase();
  const fullName = String(body.fullName ?? "").trim();

  if (!email) {
    return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
  }
  if (!isInvitableRole(role)) {
    return NextResponse.json({ error: "Peran harus staff atau akuntan" }, { status: 400 });
  }

  try {
    const result = await addOrgMember({
      orgId: auth.org.id,
      email,
      role,
      fullName: fullName || undefined
    });
    return NextResponse.json({
      ok: true,
      userId: result.userId,
      created: result.created,
      tempPassword: result.tempPassword ?? null,
      message: result.created
        ? "Akun baru dibuat. Bagikan password sementara ke anggota tim."
        : "Anggota ditambahkan ke organisasi."
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal menambah anggota";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
