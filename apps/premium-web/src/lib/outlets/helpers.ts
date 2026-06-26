import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { OUTLET_PUSAT_CODE } from "@/lib/outlets/constants";

export function normalizeOutletCode(value: string | null | undefined): string {
  const code = String(value || "").trim().toUpperCase();
  if (!code || code === OUTLET_PUSAT_CODE) return OUTLET_PUSAT_CODE;
  return code;
}

/** Segment laporan: null/kosong → PUSAT */
export function outletSegmentKey(value: string | null | undefined): string {
  return normalizeOutletCode(value);
}

export async function resolveOutletCodeForSave(
  supabase: SupabaseClient,
  organizationId: string,
  rawCode: string | null | undefined
): Promise<string | null> {
  const addons = await fetchOrgAddons(supabase, organizationId);
  if (!isAddonEnabled(addons, "outlet")) return null;

  const code = String(rawCode || "").trim();
  if (!code) return null;

  const normalized = normalizeOutletCode(code);
  if (normalized === OUTLET_PUSAT_CODE) return OUTLET_PUSAT_CODE;

  const { data, error } = await supabase
    .from("outlets")
    .select("outlet_code")
    .eq("organization_id", organizationId)
    .eq("outlet_code", normalized)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Outlet "${normalized}" tidak ditemukan atau tidak aktif`);

  return normalized;
}
