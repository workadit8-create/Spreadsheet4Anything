/** @deprecated Gunakan tax-settings — dipertahankan untuk kompatibilitas import lama */

import {
  DEFAULT_PPN_RATE_PERCENT,
  fetchOrgTaxSettings,
  resolveTaxSettings,
  type TaxSettings
} from "@/lib/org/tax-settings";

export { DEFAULT_PPN_RATE_PERCENT };

export type PpnSettings = {
  pkpEnabled: boolean;
  ratePercent: number;
  priceIncludesPpn: boolean;
};

export function defaultPpnSettings(): PpnSettings {
  return {
    pkpEnabled: false,
    ratePercent: DEFAULT_PPN_RATE_PERCENT,
    priceIncludesPpn: false
  };
}

export function taxSettingsToPpn(settings: TaxSettings): PpnSettings {
  return {
    pkpEnabled: settings.ppn.pkpEnabled,
    ratePercent: settings.ppn.ratePercent,
    priceIncludesPpn: settings.ppn.priceIncludesTax
  };
}

export function resolvePpnSettings(
  settings: { ppn?: Record<string, unknown>; tax?: Record<string, unknown> } | null | undefined
): PpnSettings {
  return taxSettingsToPpn(resolveTaxSettings(settings));
}

export function buildPpnSettingsPatch(input: {
  pkpEnabled?: boolean;
  priceIncludesPpn?: boolean;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    rate_percent: DEFAULT_PPN_RATE_PERCENT
  };
  if (input.pkpEnabled !== undefined) {
    patch.pkp_enabled = input.pkpEnabled;
  }
  if (input.priceIncludesPpn !== undefined) {
    patch.price_includes_tax = input.priceIncludesPpn;
  }
  return patch;
}

export async function fetchOrgPpnSettings(
  supabase: Parameters<typeof fetchOrgTaxSettings>[0],
  organizationId: string
): Promise<PpnSettings> {
  const tax = await fetchOrgTaxSettings(supabase, organizationId);
  return taxSettingsToPpn(tax);
}
