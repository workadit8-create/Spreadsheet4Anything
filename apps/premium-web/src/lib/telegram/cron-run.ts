import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { normalizeMembershipRole, type MembershipRole } from "@/lib/org/roles";
import { sendTelegramMessage } from "@/lib/telegram/bot";
import {
  fetchOwnerRingkasan,
  formatOwnerRingkasanMessage
} from "@/lib/telegram/owner-ringkasan";
import {
  fetchProjectReminderTasks,
  formatProjectRemindersMessage
} from "@/lib/telegram/project-reminders";
import { wibCurrentHour, wibTodayIso } from "@/lib/telegram/wib";

type CronRow = {
  id: string;
  user_id: string;
  organization_id: string;
  telegram_chat_id: number;
  daily_digest_enabled: boolean;
  project_reminders_enabled: boolean;
  digest_hour_wib: number;
  project_reminder_hour_wib: number;
  last_digest_sent_on: string | null;
  last_project_reminder_on: string | null;
};

export type TelegramCronResult = {
  hourWib: number;
  dateWib: string;
  digestsSent: number;
  projectRemindersSent: number;
  errors: string[];
};

async function membershipRole(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<MembershipRole> {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return normalizeMembershipRole(data?.role);
}

export async function runTelegramCron(
  supabase: SupabaseClient,
  options?: { ignoreHour?: boolean }
): Promise<TelegramCronResult> {
  const hourWib = wibCurrentHour();
  const dateWib = wibTodayIso();
  const ignoreHour = options?.ignoreHour ?? false;
  const result: TelegramCronResult = {
    hourWib,
    dateWib,
    digestsSent: 0,
    projectRemindersSent: 0,
    errors: []
  };

  const { data: rows, error } = await supabase
    .from("user_telegram_settings")
    .select(
      "id, user_id, organization_id, telegram_chat_id, daily_digest_enabled, project_reminders_enabled, digest_hour_wib, project_reminder_hour_wib, last_digest_sent_on, last_project_reminder_on"
    )
    .not("telegram_chat_id", "is", null);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  const orgNameCache = new Map<string, string>();

  for (const raw of rows || []) {
    const row = raw as CronRow;
    const chatId = row.telegram_chat_id;
    if (!chatId) continue;

    let orgName = orgNameCache.get(row.organization_id);
    if (!orgName) {
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", row.organization_id)
        .maybeSingle();
      orgName = String(orgRow?.name || "Organisasi");
      orgNameCache.set(row.organization_id, orgName);
    }

    const orgLabel = orgName;

    const role = await membershipRole(supabase, row.user_id, row.organization_id);
    const addons = await fetchOrgAddons(supabase, row.organization_id);
    const hasProjectAddon = isAddonEnabled(addons, "project");

    if (
      row.daily_digest_enabled &&
      role === "owner" &&
      (ignoreHour || row.digest_hour_wib === hourWib) &&
      row.last_digest_sent_on !== dateWib
    ) {
      try {
        const ringkasan = await fetchOwnerRingkasan(supabase, row.organization_id, dateWib);
        const text = formatOwnerRingkasanMessage(orgLabel, ringkasan);
        const sent = await sendTelegramMessage(chatId, text);
        if (!sent.ok) {
          result.errors.push(`digest ${row.id}: ${sent.error}`);
        } else {
          await supabase
            .from("user_telegram_settings")
            .update({
              last_digest_sent_on: dateWib,
              updated_at: new Date().toISOString()
            })
            .eq("id", row.id);
          result.digestsSent += 1;
        }
      } catch (err) {
        result.errors.push(
          `digest ${row.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (
      row.project_reminders_enabled &&
      hasProjectAddon &&
      role !== "cashier" &&
      (ignoreHour || row.project_reminder_hour_wib === hourWib) &&
      row.last_project_reminder_on !== dateWib
    ) {
      try {
        const tasks = await fetchProjectReminderTasks(supabase, row.organization_id, dateWib);
        if (tasks.length > 0) {
          const text = formatProjectRemindersMessage(orgLabel, tasks, dateWib);
          const sent = await sendTelegramMessage(chatId, text);
          if (!sent.ok) {
            result.errors.push(`project ${row.id}: ${sent.error}`);
          } else {
            await supabase
              .from("user_telegram_settings")
              .update({
                last_project_reminder_on: dateWib,
                updated_at: new Date().toISOString()
              })
              .eq("id", row.id);
            result.projectRemindersSent += 1;
          }
        } else {
          await supabase
            .from("user_telegram_settings")
            .update({
              last_project_reminder_on: dateWib,
              updated_at: new Date().toISOString()
            })
            .eq("id", row.id);
        }
      } catch (err) {
        result.errors.push(
          `project ${row.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return result;
}

export async function sendTestDailyDigest(
  supabase: SupabaseClient,
  organizationId: string,
  orgName: string,
  chatId: number
): Promise<{ ok: boolean; error?: string }> {
  const ringkasan = await fetchOwnerRingkasan(supabase, organizationId);
  const text = formatOwnerRingkasanMessage(orgName, ringkasan);
  const sent = await sendTelegramMessage(chatId, text);
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ok: true };
}
