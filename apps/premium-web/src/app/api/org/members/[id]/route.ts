import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { removeOrgMember, updateOrgMemberRole } from "@/lib/org/members";
import { normalizeMembershipRole } from "@/lib/org/roles";
import { requireOwnerRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requireOwnerRole(auth.role);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { id } = await context.params;
  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  const role = normalizeMembershipRole(body.role);

  try {
    await updateOrgMemberRole({
      orgId: auth.org.id,
      membershipId: id,
      role,
      actorUserId: auth.user.id
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal mengubah peran";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requireOwnerRole(auth.role);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { id } = await context.params;

  try {
    await removeOrgMember({
      orgId: auth.org.id,
      membershipId: id,
      actorUserId: auth.user.id
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal menghapus anggota";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
