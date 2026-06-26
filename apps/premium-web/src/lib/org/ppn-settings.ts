import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_PPN_RATE_PERCENT = 11;

export type PpnSettings = {
  /** Usaha terdaftar PKP — PPN aktif di transaksi (fase berikutnya) */
  pkpEnabled: boolean;
  ratePercent: number;
  /** true = harga produk sudah termasuk PPN */
  priceIncludesPpn: boolean;
};

export function defaultPpnSettings(): PpnSettings {
  return {
    pkpEnabled: false,
    ratePercent: DEFAULT_PPN_RATE_PERCENT,
    priceIncludesPpn: false
  };
}

export function resolvePpnSettings(
  settings: { ppn?: Record<string, unknown> } | null | undefined
): PpnSettings {
  const raw = settings?.ppn;
  const defaults = defaultPpnSettings();
  if (!raw || typeof raw !== "object") return defaults;

  return {
    pkpEnabled: raw.pkp_enabled === true || raw.pkpEnabled === true,
    ratePercent:
      typeof raw.rate_percent === "number"
        ? raw.rate_percent
        : typeof raw.ratePercent === "number"
          ? raw.ratePercent
          : DEFAULT_PPN_RATE_PERCENT,
    priceIncludesPpn: raw.price_includes_ppn === true || raw.priceIncludesPpn === true
  };
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
    patch.price_includes_ppn = input.priceIncludesPpn;
  }
  return patch;
}

export async function fetchOrgPpnSettings(
  supabase: SupabaseClient,
  organizationId: string
): Promise<PpnSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return resolvePpnSettings(data?.settings as { ppn?: Record<string, unknown> } | undefined);
}
