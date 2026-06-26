import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeMembershipRole } from "@/lib/org/roles";
import { sendTelegramMessage } from "@/lib/telegram/bot";
import {
  fetchOwnerRingkasan,
  formatOwnerRingkasanMessage
} from "@/lib/telegram/owner-ringkasan";

const RINGKASAN_COOLDOWN_MS = 60_000;
const lastRingkasanByChat = new Map<number, number>();

export function isRingkasanOnCooldown(chatId: number): boolean {
  const last = lastRingkasanByChat.get(chatId);
  if (!last) return false;
  return Date.now() - last < RINGKASAN_COOLDOWN_MS;
}

export async function handleRingkasanCommand(
  supabase: SupabaseClient,
  chatId: number
): Promise<void> {
  if (isRingkasanOnCooldown(chatId)) {
    await sendTelegramMessage(
      chatId,
      "⏳ Tunggu sekitar 1 menit sebelum minta <b>/ringkasan</b> lagi."
    );
    return;
  }

  const { data: rows, error } = await supabase
    .from("user_telegram_settings")
    .select("id, user_id, organization_id")
    .eq("telegram_chat_id", chatId);

  if (error || !rows?.length) {
    await sendTelegramMessage(
      chatId,
      "Akun Telegram belum terhubung. Buka halaman <b>Akun</b> di Premium Web → <b>Hubungkan Telegram</b>."
    );
    return;
  }

  let sent = 0;
  const orgNameCache = new Map<string, string>();

  for (const row of rows) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", row.user_id)
      .eq("organization_id", row.organization_id)
      .maybeSingle();

    if (normalizeMembershipRole(membership?.role) !== "owner") continue;

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

    try {
      const ringkasan = await fetchOwnerRingkasan(supabase, row.organization_id);
      const text = formatOwnerRingkasanMessage(orgName, ringkasan);
      const result = await sendTelegramMessage(chatId, text);
      if (result.ok) sent += 1;
    } catch (err) {
      await sendTelegramMessage(
        chatId,
        `❌ Gagal memuat ringkasan: ${escapeErr(err)}`
      );
      return;
    }
  }

  if (sent === 0) {
    await sendTelegramMessage(
      chatId,
      "Perintah <b>/ringkasan</b> hanya untuk <b>owner</b>. Hubungkan akun owner di halaman Akun."
    );
    return;
  }

  lastRingkasanByChat.set(chatId, Date.now());
}

function escapeErr(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
