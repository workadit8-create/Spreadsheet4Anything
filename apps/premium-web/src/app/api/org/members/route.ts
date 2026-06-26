import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { addOrgMember, isInvitableRole, listOrgMembers } from "@/lib/org/members";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";

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
    const addons = await fetchOrgAddons(supabase, auth.org.id);
    const outletAddon = isAddonEnabled(addons, "outlet")
      ? await fetchOutletBootstrap(supabase, auth.org.id)
      : { enabled: false, options: [] };

    return NextResponse.json({ members, outletAddon });
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

  let body: { email?: string; role?: string; fullName?: string; outletCodes?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  const role = String(body.role ?? "").trim().toLowerCase();
  const fullName = String(body.fullName ?? "").trim();
  const outletCodes = Array.isArray(body.outletCodes)
    ? body.outletCodes.map((c) => String(c).trim()).filter(Boolean)
    : [];

  if (!email) {
    return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
  }
  if (!isInvitableRole(role)) {
    return NextResponse.json({ error: "Peran harus staff, akuntan, kasir, atau stok outlet" }, { status: 400 });
  }
  if ((role === "cashier" || role === "outlet_staff") && !outletCodes.length) {
    return NextResponse.json({ error: "Wajib ditetapkan ke minimal satu outlet" }, { status: 400 });
  }

  try {
    const result = await addOrgMember(supabase, {
      orgId: auth.org.id,
      email,
      role,
      fullName: fullName || undefined,
      outletCodes: role === "cashier" || role === "outlet_staff" ? outletCodes : undefined
    });

    await writeAuditLog(
      supabase,
      auditFromContext(auth, AUDIT_ACTIONS.memberAdd, {
        resourceType: "membership",
        resourceId: result.userId,
        metadata: {
          email,
          role,
          created: result.created,
          outletCodes: role === "cashier" || role === "outlet_staff" ? outletCodes : []
        },
        request
      })
    );

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
