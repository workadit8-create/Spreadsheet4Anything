import type { SupabaseClient } from "@supabase/supabase-js";
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

type RingkasanTarget = {
  organization_id: string;
  organization_name: string;
  user_id: string;
};

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

  const { data, error } = await supabase.rpc("resolve_telegram_ringkasan_targets", {
    p_chat_id: chatId
  });

  if (error) {
    await sendTelegramMessage(
      chatId,
      `❌ Gagal memuat ringkasan (${escapeErr(error.message)}). Coba lagi atau hubungi admin platform.`
    );
    return;
  }

  const rows = (data || []) as RingkasanTarget[];
  if (!rows.length) {
    await sendTelegramMessage(
      chatId,
      "Akun Telegram belum terhubung. Buka halaman <b>Akun</b> di Premium Web → <b>Hubungkan Telegram</b>."
    );
    return;
  }

  let sent = 0;

  for (const row of rows) {
    const orgName = String(row.organization_name || "Organisasi");
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
