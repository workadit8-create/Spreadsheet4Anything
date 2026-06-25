import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEMBERSHIP_ROLES, type MembershipRole, normalizeMembershipRole } from "@/lib/org/roles";

export type OrgMemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  role: MembershipRole;
  createdAt: string;
};

/** Role yang boleh ditambahkan owner lewat UI (bukan owner). */
export const INVITABLE_ROLES = ["staff", "akuntan"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(value: string): value is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(value);
}

export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let suffix = "";
  for (let i = 0; i < 10; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `Premium${suffix}!`;
}

export async function listOrgMembers(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgMemberRow[]> {
  const { data, error } = await supabase.rpc("get_org_members", { p_org_id: orgId });
  if (error) throw new Error(error.message);

  return (data || []).map(
    (row: {
      membership_id: string;
      user_id: string;
      email: string;
      full_name: string;
      role: string;
      created_at: string;
    }) => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name || "",
      role: normalizeMembershipRole(row.role),
      createdAt: row.created_at
    })
  );
}

export async function findUserByEmail(email: string) {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (hit) return hit;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

export async function countOrgOwners(orgId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("role", "owner");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getMembershipById(orgId: string, membershipId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("memberships")
    .select("id, user_id, role, organization_id")
    .eq("id", membershipId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function addOrgMember(params: {
  orgId: string;
  email: string;
  role: InvitableRole;
  fullName?: string;
}): Promise<{ userId: string; created: boolean; tempPassword?: string }> {
  const admin = createAdminClient();
  const email = params.email.trim().toLowerCase();
  if (!email) throw new Error("Email wajib diisi");

  let user = await findUserByEmail(email);
  let created = false;
  let tempPassword: string | undefined;

  if (!user) {
    tempPassword = generateTempPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: params.fullName ? { full_name: params.fullName } : undefined
    });
    if (error) throw new Error(error.message);
    user = data.user;
    created = true;
  }

  if (!user?.id) throw new Error("Gagal membuat atau menemukan user");

  const { data: existing } = await admin
    .from("memberships")
    .select("id")
    .eq("organization_id", params.orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    throw new Error("Email sudah terdaftar di organisasi ini");
  }

  const { error: memError } = await admin.from("memberships").insert({
    organization_id: params.orgId,
    user_id: user.id,
    role: params.role
  });
  if (memError) throw new Error(memError.message);

  return { userId: user.id, created, tempPassword: created ? tempPassword : undefined };
}

export async function updateOrgMemberRole(params: {
  orgId: string;
  membershipId: string;
  role: MembershipRole;
  actorUserId: string;
}): Promise<void> {
  if (!(MEMBERSHIP_ROLES as readonly string[]).includes(params.role)) {
    throw new Error("Peran tidak valid");
  }

  const membership = await getMembershipById(params.orgId, params.membershipId);
  if (!membership) throw new Error("Anggota tidak ditemukan");

  if (membership.role === "owner" && params.role !== "owner") {
    const owners = await countOrgOwners(params.orgId);
    if (owners <= 1) {
      throw new Error("Tidak bisa mengubah peran owner terakhir");
    }
  }

  if (membership.user_id === params.actorUserId && membership.role === "owner" && params.role !== "owner") {
    throw new Error("Anda tidak bisa menurunkan peran owner sendiri");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("memberships")
    .update({ role: params.role })
    .eq("id", params.membershipId)
    .eq("organization_id", params.orgId);
  if (error) throw new Error(error.message);
}

export async function removeOrgMember(params: {
  orgId: string;
  membershipId: string;
  actorUserId: string;
}): Promise<void> {
  const membership = await getMembershipById(params.orgId, params.membershipId);
  if (!membership) throw new Error("Anggota tidak ditemukan");

  if (membership.role === "owner") {
    const owners = await countOrgOwners(params.orgId);
    if (owners <= 1) {
      throw new Error("Tidak bisa menghapus owner terakhir");
    }
  }

  if (membership.user_id === params.actorUserId) {
    throw new Error("Anda tidak bisa menghapus keanggotaan sendiri");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("memberships")
    .delete()
    .eq("id", params.membershipId)
    .eq("organization_id", params.orgId);
  if (error) throw new Error(error.message);
}
