const TELEGRAM_API = "https://api.telegram.org";

export type TelegramSendResult = { ok: true } | { ok: false; error: string };

export function getTelegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token || null;
}

export function getTelegramBotUsername(): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return username || null;
}

export function buildTelegramDeepLink(token: string): string | null {
  const username = getTelegramBotUsername();
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(token)}`;
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: { disablePreview?: boolean }
): Promise<TelegramSendResult> {
  const token = getTelegramBotToken();
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN belum diset" };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: options?.disablePreview ?? true
      })
    });

    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(amount);
}
