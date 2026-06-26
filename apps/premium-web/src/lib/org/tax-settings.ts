import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_PPN_RATE_PERCENT = 11;
export const DEFAULT_PB_RATE_PERCENT = 10;

export type TaxActiveType = "none" | "ppn" | "pb";

export type PpnTaxConfig = {
  pkpEnabled: boolean;
  ratePercent: number;
  priceIncludesTax: boolean;
};

export type PbTaxConfig = {
  enabled: boolean;
  ratePercent: number;
  priceIncludesTax: boolean;
};

export type TaxSettings = {
  activeType: TaxActiveType;
  ppn: PpnTaxConfig;
  pb: PbTaxConfig;
};

export function defaultTaxSettings(): TaxSettings {
  return {
    activeType: "none",
    ppn: {
      pkpEnabled: false,
      ratePercent: DEFAULT_PPN_RATE_PERCENT,
      priceIncludesTax: false
    },
    pb: {
      enabled: false,
      ratePercent: DEFAULT_PB_RATE_PERCENT,
      priceIncludesTax: false
    }
  };
}

function readPriceIncludes(raw: Record<string, unknown>): boolean {
  return (
    raw.price_includes_tax === true ||
    raw.priceIncludesTax === true ||
    raw.price_includes_ppn === true ||
    raw.priceIncludesPpn === true
  );
}

function readPpnConfig(raw: Record<string, unknown> | undefined): PpnTaxConfig {
  const defaults = defaultTaxSettings().ppn;
  if (!raw || typeof raw !== "object") return defaults;
  return {
    pkpEnabled: raw.pkp_enabled === true || raw.pkpEnabled === true,
    ratePercent:
      typeof raw.rate_percent === "number"
        ? raw.rate_percent
        : typeof raw.ratePercent === "number"
          ? raw.ratePercent
          : DEFAULT_PPN_RATE_PERCENT,
    priceIncludesTax: readPriceIncludes(raw)
  };
}

function readPbConfig(raw: Record<string, unknown> | undefined): PbTaxConfig {
  const defaults = defaultTaxSettings().pb;
  if (!raw || typeof raw !== "object") return defaults;
  return {
    enabled: raw.enabled === true,
    ratePercent:
      typeof raw.rate_percent === "number"
        ? raw.rate_percent
        : typeof raw.ratePercent === "number"
          ? raw.ratePercent
          : DEFAULT_PB_RATE_PERCENT,
    priceIncludesTax: readPriceIncludes(raw)
  };
}

function readActiveType(
  taxRaw: Record<string, unknown> | undefined,
  legacyPpn: PpnTaxConfig
): TaxActiveType {
  const raw = taxRaw?.active_type ?? taxRaw?.activeType;
  if (raw === "ppn" || raw === "pb" || raw === "none") return raw;
  if (legacyPpn.pkpEnabled) return "ppn";
  return "none";
}

export function resolveTaxSettings(
  settings: { tax?: Record<string, unknown>; ppn?: Record<string, unknown> } | null | undefined
): TaxSettings {
  const legacyPpn = readPpnConfig(settings?.ppn);
  const taxRaw = settings?.tax;
  const ppn = readPpnConfig(
    (taxRaw?.ppn as Record<string, unknown> | undefined) || settings?.ppn
  );
  const pb = readPbConfig(taxRaw?.pb as Record<string, unknown> | undefined);
  const activeType = readActiveType(
    taxRaw && typeof taxRaw === "object" ? taxRaw : undefined,
    legacyPpn
  );

  if (activeType === "pb" && !pb.enabled) {
    pb.enabled = true;
  }

  return { activeType, ppn, pb };
}

export function isProductTaxEnabled(settings: TaxSettings): boolean {
  if (settings.activeType === "ppn") return settings.ppn.pkpEnabled;
  if (settings.activeType === "pb") return settings.pb.enabled;
  return false;
}

export function productTaxFieldLabel(settings: TaxSettings): string {
  return settings.activeType === "pb" ? "Kena PB" : "Kena PPN";
}

export function productTaxColumnLabel(settings: TaxSettings): string {
  return settings.activeType === "pb" ? "PB" : "PPN";
}

export function buildTaxSettingsStorage(settings: TaxSettings): Record<string, unknown> {
  return {
    active_type: settings.activeType,
    ppn: {
      pkp_enabled: settings.ppn.pkpEnabled,
      rate_percent: settings.ppn.ratePercent,
      price_includes_tax: settings.ppn.priceIncludesTax
    },
    pb: {
      enabled: settings.pb.enabled,
      rate_percent: settings.pb.ratePercent,
      price_includes_tax: settings.pb.priceIncludesTax
    }
  };
}

export async function fetchOrgTaxSettings(
  supabase: SupabaseClient,
  organizationId: string
): Promise<TaxSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return resolveTaxSettings(
    data?.settings as { tax?: Record<string, unknown>; ppn?: Record<string, unknown> } | undefined
  );
}

export type TaxSettingsPatch = {
  activeType?: TaxActiveType;
  ppn?: Partial<Pick<PpnTaxConfig, "pkpEnabled" | "priceIncludesTax">>;
  pb?: Partial<Pick<PbTaxConfig, "enabled" | "ratePercent" | "priceIncludesTax">>;
};

export function applyTaxSettingsPatch(current: TaxSettings, body: TaxSettingsPatch): TaxSettings {
  const next: TaxSettings = {
    ...current,
    ppn: { ...current.ppn },
    pb: { ...current.pb }
  };

  if (body.activeType !== undefined) {
    next.activeType = body.activeType;
    if (body.activeType === "pb") {
      next.pb.enabled = true;
    }
    if (body.activeType === "none") {
      next.pb.enabled = false;
    }
  }

  if (body.ppn?.pkpEnabled !== undefined) {
    next.ppn.pkpEnabled = Boolean(body.ppn.pkpEnabled);
  }
  if (body.ppn?.priceIncludesTax !== undefined) {
    next.ppn.priceIncludesTax = Boolean(body.ppn.priceIncludesTax);
  }

  if (body.pb?.enabled !== undefined) {
    next.pb.enabled = Boolean(body.pb.enabled);
  }
  if (body.pb?.ratePercent !== undefined) {
    const rate = Number(body.pb.ratePercent);
    if (!Number.isNaN(rate) && rate >= 0 && rate <= 100) {
      next.pb.ratePercent = rate;
    }
  }
  if (body.pb?.priceIncludesTax !== undefined) {
    next.pb.priceIncludesTax = Boolean(body.pb.priceIncludesTax);
  }

  return next;
}

export async function saveOrgTaxSettings(
  supabase: SupabaseClient,
  organizationId: string,
  body: TaxSettingsPatch
): Promise<{ tax: TaxSettings; error: string | null }> {
  const { data: existing } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const current = resolveTaxSettings(
    existing?.settings as { tax?: Record<string, unknown>; ppn?: Record<string, unknown> } | undefined
  );
  const tax = applyTaxSettingsPatch(current, body);

  const mergedSettings = {
    ...((existing?.settings as Record<string, unknown>) || {}),
    tax: buildTaxSettingsStorage(tax),
    ppn: buildTaxSettingsStorage(tax).ppn
  };

  const { error } = await supabase.from("app_settings").upsert({
    organization_id: organizationId,
    settings: mergedSettings,
    updated_at: new Date().toISOString()
  });

  if (error) return { tax, error: error.message };
  return { tax, error: null };
}
