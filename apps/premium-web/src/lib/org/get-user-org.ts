import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgRow = { id: string; slug: string; name: string };

export async function getUserPrimaryOrg(supabase: SupabaseClient): Promise<OrgRow | null> {
  const { data, error } = await supabase.rpc("get_my_organizations");
  if (error || !data?.length) return null;
  return data[0] as OrgRow;
}
