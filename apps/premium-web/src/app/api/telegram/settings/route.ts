import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  buildTelegramDeepLink,
  getTelegramBotUsername
} from "@/lib/telegram/bot";
import { sendTestDailyDigest } from "@/lib/telegram/cron-run";
import {
  disconnectTelegram,
  generateTelegramLinkToken,
  getOrCreateTelegramSettings,
  toTelegramSettingsView,
  updateTelegramPreferences
} from "@/lib/telegram/settings";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  const hasProjectAddon = isAddonEnabled(addons, "project");
  const row = await getOrCreateTelegramSettings(
    supabase,
    auth.user.id,
    auth.org.id,
    auth.role
  );
  const botUsername = getTelegramBotUsername();

  return NextResponse.json({
    settings: toTelegramSettingsView(row, auth.role, hasProjectAddon, botUsername)
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  let body: { action?: string; dailyDigestEnabled?: boolean; projectRemindersEnabled?: boolean; digestHourWib?: number; projectReminderHourWib?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const action = String(body.action || "link");

  if (action === "disconnect") {
    const ok = await disconnectTelegram(supabase, auth.user.id, auth.org.id);
    if (!ok) {
      return NextResponse.json({ error: "Gagal memutus Telegram" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "preferences") {
    const ok = await updateTelegramPreferences(supabase, auth.user.id, auth.org.id, {
      dailyDigestEnabled: body.dailyDigestEnabled,
      projectRemindersEnabled: body.projectRemindersEnabled,
      digestHourWib: body.digestHourWib,
      projectReminderHourWib: body.projectReminderHourWib
    });
    if (!ok) {
      return NextResponse.json({ error: "Gagal menyimpan preferensi" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "test-digest") {
    if (auth.role !== "owner") {
      return NextResponse.json({ error: "Hanya owner yang bisa uji digest" }, { status: 403 });
    }
    const row = await getOrCreateTelegramSettings(
      supabase,
      auth.user.id,
      auth.org.id,
      auth.role
    );
    if (!row?.telegram_chat_id) {
      return NextResponse.json({ error: "Telegram belum terhubung" }, { status: 400 });
    }
    const sent = await sendTestDailyDigest(
      supabase,
      auth.org.id,
      auth.org.name,
      row.telegram_chat_id
    );
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error || "Gagal kirim" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: "Digest uji coba dikirim ke Telegram" });
  }

  const link = await generateTelegramLinkToken(
    supabase,
    auth.user.id,
    auth.org.id,
    auth.role
  );
  if (!link) {
    return NextResponse.json({ error: "Gagal membuat link" }, { status: 500 });
  }

  const deepLink = buildTelegramDeepLink(link.token);
  if (!deepLink) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_USERNAME belum diset di server" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    deepLink,
    expiresAt: link.expiresAt,
    message: "Buka link di Telegram, tekan Start. Link berlaku 15 menit."
  });
}
