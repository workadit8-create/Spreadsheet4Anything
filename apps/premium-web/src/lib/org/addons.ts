import type { SupabaseClient } from "@supabase/supabase-js";
import { OrgAuthError } from "@/lib/org/require-user-org";
import {
  ADDON_CATALOG,
  type AddonKey,
  type OrgAddonsMap,
  isAddonEnabled,
  resolveAddonsMap
} from "@/lib/org/addons-catalog";

export {
  ADDON_KEYS,
  ADDON_CATALOG,
  type AddonKey,
  type AddonInfo,
  type OrgAddonsMap,
  emptyAddonsMap,
  isAddonKey,
  resolveAddonsMap,
  isAddonEnabled,
  listEnabledAddonKeys,
  toAddonInfoList
} from "@/lib/org/addons-catalog";

export async function fetchOrgAddons(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgAddonsMap> {
  const { data, error } = await supabase
    .from("tenant_addons")
    .select("addon_key, enabled")
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);
  return resolveAddonsMap(data || []);
}

export async function requireAddon(
  supabase: SupabaseClient,
  orgId: string,
  key: AddonKey
): Promise<OrgAddonsMap> {
  const map = await fetchOrgAddons(supabase, orgId);
  if (!isAddonEnabled(map, key)) {
    throw new OrgAuthError(403, `Add-on ${ADDON_CATALOG[key].label} tidak aktif`);
  }
  return map;
}
