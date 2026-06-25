import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipRole } from "@/lib/org/roles";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import crypto from "crypto";

export type TelegramSettingsRow = {
  id: string;
  user_id: string;
  organization_id: string;
  telegram_chat_id: number | null;
  telegram_username: string | null;
  daily_digest_enabled: boolean;
  project_reminders_enabled: boolean;
  digest_hour_wib: number;
  project_reminder_hour_wib: number;
  connected_at: string | null;
};

export type TelegramSettingsView = {
  connected: boolean;
  telegramUsername: string | null;
  dailyDigestEnabled: boolean;
  projectRemindersEnabled: boolean;
  digestHourWib: number;
  projectReminderHourWib: number;
  canDailyDigest: boolean;
  canProjectReminders: boolean;
  botConfigured: boolean;
  botUsername: string | null;
};

function defaultFlagsForRole(role: MembershipRole, hasProjectAddon: boolean) {
  return {
    daily_digest_enabled: role === "owner",
    project_reminders_enabled: hasProjectAddon && role !== "cashier"
  };
}

export async function getOrCreateTelegramSettings(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  role: MembershipRole
): Promise<TelegramSettingsRow | null> {
  const addons = await fetchOrgAddons(supabase, organizationId);
  const hasProjectAddon = isAddonEnabled(addons, "project");
  const defaults = defaultFlagsForRole(role, hasProjectAddon);

  const { data: existing } = await supabase
    .from("user_telegram_settings")
    .select("*")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existing) return existing as TelegramSettingsRow;

  const { data: inserted, error } = await supabase
    .from("user_telegram_settings")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      ...defaults
    })
    .select("*")
    .single();

  if (error) return null;
  return inserted as TelegramSettingsRow;
}

export function toTelegramSettingsView(
  row: TelegramSettingsRow | null,
  role: MembershipRole,
  hasProjectAddon: boolean,
  botUsername: string | null
): TelegramSettingsView {
  const canDailyDigest = role === "owner";
  const canProjectReminders = hasProjectAddon && role !== "cashier";

  if (!row) {
    return {
      connected: false,
      telegramUsername: null,
      dailyDigestEnabled: canDailyDigest,
      projectRemindersEnabled: canProjectReminders,
      digestHourWib: 20,
      projectReminderHourWib: 8,
      canDailyDigest,
      canProjectReminders,
      botConfigured: Boolean(botUsername),
      botUsername
    };
  }

  return {
    connected: row.telegram_chat_id != null,
    telegramUsername: row.telegram_username,
    dailyDigestEnabled: row.daily_digest_enabled,
    projectRemindersEnabled: row.project_reminders_enabled,
    digestHourWib: row.digest_hour_wib,
    projectReminderHourWib: row.project_reminder_hour_wib,
    canDailyDigest,
    canProjectReminders,
    botConfigured: Boolean(botUsername),
    botUsername
  };
}

export function createLinkToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function generateTelegramLinkToken(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  role: MembershipRole
): Promise<{ token: string; expiresAt: string } | null> {
  const row = await getOrCreateTelegramSettings(supabase, userId, organizationId, role);
  if (!row) return null;

  const token = createLinkToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("user_telegram_settings")
    .update({
      link_token: token,
      link_token_expires_at: expiresAt,
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id)
    .eq("user_id", userId);

  if (error) return null;
  return { token, expiresAt };
}

export async function disconnectTelegram(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("user_telegram_settings")
    .update({
      telegram_chat_id: null,
      telegram_username: null,
      link_token: null,
      link_token_expires_at: null,
      connected_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("organization_id", organizationId);

  return !error;
}

export async function updateTelegramPreferences(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  prefs: {
    dailyDigestEnabled?: boolean;
    projectRemindersEnabled?: boolean;
    digestHourWib?: number;
    projectReminderHourWib?: number;
  }
): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (prefs.dailyDigestEnabled !== undefined) {
    patch.daily_digest_enabled = prefs.dailyDigestEnabled;
  }
  if (prefs.projectRemindersEnabled !== undefined) {
    patch.project_reminders_enabled = prefs.projectRemindersEnabled;
  }
  if (prefs.digestHourWib !== undefined) {
    patch.digest_hour_wib = Math.min(23, Math.max(0, prefs.digestHourWib));
  }
  if (prefs.projectReminderHourWib !== undefined) {
    patch.project_reminder_hour_wib = Math.min(23, Math.max(0, prefs.projectReminderHourWib));
  }

  const { error } = await supabase
    .from("user_telegram_settings")
    .update(patch)
    .eq("user_id", userId)
    .eq("organization_id", organizationId);

  return !error;
}
