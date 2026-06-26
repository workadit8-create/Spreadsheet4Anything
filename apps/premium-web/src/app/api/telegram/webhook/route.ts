import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram/bot";
import { handleRingkasanCommand } from "@/lib/telegram/ringkasan-command";

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    from?: { username?: string; first_name?: string };
    text?: string;
  };
};

export async function POST(request: Request) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (webhookSecret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== webhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text || !message.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const username = message.from?.username || message.from?.first_name || "";
  const text = message.text.trim();

  if (text === "/ringkasan") {
    try {
      const admin = createAdminClient();
      await handleRingkasanCommand(admin, chatId);
    } catch (err) {
      await sendTelegramMessage(
        chatId,
        `❌ Server error: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (text === "/help" || text === "/start") {
    await sendTelegramMessage(
      chatId,
      "Halo! Hubungkan akun di halaman <b>Akun</b> → <b>Hubungkan Telegram</b>.\n\nOwner: <b>/ringkasan</b> — posisi keuangan &amp; transaksi hari ini.\nRingkasan harian otomatis jam 20:00 WIB (jika diaktifkan)."
    );
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/start ")) {
    const token = text.slice("/start ".length).trim();
    if (!token) {
      return NextResponse.json({ ok: true });
    }

    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("complete_telegram_link", {
        p_token: token,
        p_chat_id: chatId,
        p_username: username
      });

      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.ok) {
        await sendTelegramMessage(
          chatId,
          `❌ ${row?.message || error?.message || "Gagal menghubungkan. Buat link baru dari halaman Akun."}`
        );
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage(
        chatId,
        "✅ <b>Telegram terhubung</b> ke Premium Web.\n\nOwner: <b>/ringkasan</b> kapan saja + digest otomatis jam 20:00 WIB.\nTim: reminder proyek (jika add-on aktif).\n\nAtur preferensi di halaman Akun."
      );
    } catch (err) {
      await sendTelegramMessage(
        chatId,
        `❌ Server error: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  return NextResponse.json({ ok: true });
}
