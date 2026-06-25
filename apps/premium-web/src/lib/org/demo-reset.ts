import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgRow } from "@/lib/org/get-user-org";

export const DEMO_ORG_SLUG = "demo";

export function isDemoOrg(org: Pick<OrgRow, "slug">): boolean {
  return org.slug === DEMO_ORG_SLUG;
}

export async function resetDemoOrganization(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("reset_demo_organization", { p_org_id: orgId });
  if (error) return { error: error.message };
  return { error: null };
}
