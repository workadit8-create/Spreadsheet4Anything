import type { SupabaseClient } from "@supabase/supabase-js";
import { type MembershipRole, normalizeMembershipRole } from "@/lib/org/roles";

export type MembershipOutletScope = {
  outletCode: string;
  canPos: boolean;
  canInventory: boolean;
};

export type OrgMemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  role: MembershipRole;
  createdAt: string;
  outletScopes: MembershipOutletScope[];
};

/** Role yang boleh ditambahkan owner lewat UI (bukan owner). */
export const INVITABLE_ROLES = ["staff", "akuntan", "cashier"] as const;
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
      outlet_scopes?: Array<{
        outletCode?: string;
        canPos?: boolean;
        canInventory?: boolean;
      }> | null;
    }) => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name || "",
      role: normalizeMembershipRole(row.role),
      createdAt: row.created_at,
      outletScopes: (row.outlet_scopes || []).map((s) => ({
        outletCode: String(s.outletCode || ""),
        canPos: s.canPos !== false,
        canInventory: Boolean(s.canInventory)
      }))
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
    outletCodes?: string[];
  }
): Promise<{ userId: string; membershipId: string; created: boolean; tempPassword?: string }> {
  const email = params.email.trim().toLowerCase();
  if (!email) throw new Error("Email wajib diisi");

  const outletCodes =
    params.role === "cashier"
      ? (params.outletCodes || []).map((c) => c.trim().toUpperCase()).filter(Boolean)
      : null;

  if (params.role === "cashier" && !outletCodes?.length) {
    throw new Error("Kasir wajib ditetapkan ke minimal satu outlet");
  }

  const { data, error } = await supabase.rpc("add_org_member", {
    p_org_id: params.orgId,
    p_email: email,
    p_role: params.role,
    p_full_name: params.fullName?.trim() || "",
    p_outlet_codes: outletCodes
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.user_id) throw new Error("Gagal menambah anggota");

  return {
    userId: row.user_id as string,
    membershipId: row.membership_id as string,
    created: Boolean(row.created),
    tempPassword: row.temp_password ? String(row.temp_password) : undefined
  };
}

export async function setMembershipOutletScopes(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    membershipId: string;
    outletCodes: string[];
  }
): Promise<void> {
  const outletCodes = params.outletCodes.map((c) => c.trim().toUpperCase()).filter(Boolean);
  const { error } = await supabase.rpc("set_membership_outlet_scopes", {
    p_org_id: params.orgId,
    p_membership_id: params.membershipId,
    p_outlet_codes: outletCodes
  });
  if (error) throw new Error(error.message);
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
