import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgRow } from "@/lib/org/get-user-org";

export type CompanyProfile = {
  orgName: string;
  orgSlug: string;
  name: string;
  address: string;
  phone: string;
};

type AppSettings = { business?: Record<string, unknown> } | null | undefined;

export function resolveCompanyProfile(
  org: Pick<OrgRow, "name" | "slug">,
  settings: AppSettings
): CompanyProfile {
  const business = settings?.business;
  const orgName = org.name || "Perusahaan";

  return {
    orgName,
    orgSlug: org.slug,
    name: String(business?.company_name || orgName),
    address: String(business?.address || ""),
    phone: String(business?.phone || "")
  };
}

export async function fetchCompanyProfile(
  supabase: SupabaseClient,
  org: OrgRow
): Promise<CompanyProfile> {
  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", org.id)
    .maybeSingle();

  return resolveCompanyProfile(org, settingsRow?.settings as AppSettings);
}
