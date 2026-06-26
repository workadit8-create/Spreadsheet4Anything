/** Ambil perintah bot tanpa argumen & tanpa @username (Telegram group/private). */
export function parseBotCommand(text: string): string {
  const first = text.trim().split(/\s+/)[0] ?? "";
  return first.split("@")[0]!.toLowerCase();
}
