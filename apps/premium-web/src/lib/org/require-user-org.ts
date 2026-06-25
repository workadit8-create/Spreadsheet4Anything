import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg, type OrgRow } from "@/lib/org/get-user-org";

export class OrgAuthError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "OrgAuthError";
  }
}

export type UserOrgContext = {
  supabase: SupabaseClient;
  user: User;
  org: OrgRow;
};

export function toOrgAuthResponse(err: unknown): NextResponse {
  if (err instanceof OrgAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Auth gagal";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Satu panggilan: session user + organisasi aktif (membership). */
export async function requireUserOrg(supabase?: SupabaseClient): Promise<UserOrgContext> {
  const client = supabase ?? (await createClient());
  const {
    data: { user }
  } = await client.auth.getUser();
  if (!user) throw new OrgAuthError(401, "Unauthorized");

  const org = await getUserPrimaryOrg(client);
  if (!org) throw new OrgAuthError(400, "Tidak ada organisasi");

  return { supabase: client, user, org };
}

/** Resolve org id — tolak organizationId yang bukan milik user. */
export async function resolveUserOrgId(
  supabase: SupabaseClient,
  requestedOrgId?: string | null
): Promise<string> {
  const { data: orgs, error } = await supabase.rpc("get_my_organizations");
  if (error || !orgs?.length) {
    throw new OrgAuthError(400, error?.message || "Tidak ada organisasi");
  }

  if (requestedOrgId) {
    const allowed = orgs.some((o: { id: string }) => o.id === requestedOrgId);
    if (!allowed) throw new OrgAuthError(403, "Organisasi tidak diizinkan");
    return requestedOrgId;
  }

  return orgs[0].id as string;
}

/** Defense-in-depth: resource harus milik org aktif. */
export function assertOrgMatch(orgId: string, resourceOrgId: string): void {
  if (orgId !== resourceOrgId) {
    throw new OrgAuthError(404, "Tidak ditemukan");
  }
}
