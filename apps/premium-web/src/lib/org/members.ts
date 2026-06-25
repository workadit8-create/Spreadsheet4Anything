import type { SupabaseClient } from "@supabase/supabase-js";
import { type MembershipRole, normalizeMembershipRole } from "@/lib/org/roles";

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

export async function addOrgMember(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    email: string;
    role: InvitableRole;
    fullName?: string;
  }
): Promise<{ userId: string; created: boolean; tempPassword?: string }> {
  const email = params.email.trim().toLowerCase();
  if (!email) throw new Error("Email wajib diisi");

  const { data, error } = await supabase.rpc("add_org_member", {
    p_org_id: params.orgId,
    p_email: email,
    p_role: params.role,
    p_full_name: params.fullName?.trim() || ""
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.user_id) throw new Error("Gagal menambah anggota");

  return {
    userId: row.user_id as string,
    created: Boolean(row.created),
    tempPassword: row.temp_password ? String(row.temp_password) : undefined
  };
}

export async function updateOrgMemberRole(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    membershipId: string;
    role: MembershipRole;
  }
): Promise<void> {
  const { error } = await supabase.rpc("update_org_member_role", {
    p_org_id: params.orgId,
    p_membership_id: params.membershipId,
    p_role: params.role
  });
  if (error) throw new Error(error.message);
}

export async function removeOrgMember(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    membershipId: string;
  }
): Promise<void> {
  const { error } = await supabase.rpc("remove_org_member", {
    p_org_id: params.orgId,
    p_membership_id: params.membershipId
  });
  if (error) throw new Error(error.message);
}
