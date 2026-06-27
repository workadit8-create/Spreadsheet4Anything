import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";

export async function isTitipJualEnabled(
  supabase: SupabaseClient,
  organizationId: string
): Promise<boolean> {
  const addons = await fetchOrgAddons(supabase, organizationId);
  return isAddonEnabled(addons, "titip_jual") && isAddonEnabled(addons, "inventory");
}
