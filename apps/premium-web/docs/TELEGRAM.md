# Telegram — Premium Web

Notifikasi via bot Telegram (platform-wide).

## Fitur

| Penerima | Isi | Default jam (WIB) |
|----------|-----|-------------------|
| **Owner** | Ringkasan harian: penjualan, pembelian, piutang, utang | 20:00 |
| **Tim** (add-on `project`) | Reminder tugas proyek jatuh tempo hari ini | 08:00 |

Angka digest = **CONFIRMED + POSTED** (operasional), exclude VOID.

## Setup bot (admin platform)

1. Buat bot via [@BotFather](https://t.me/BotFather) → salin token.
2. Set env di Vercel (Production):

```bash
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_BOT_USERNAME=YourPremiumBot   # tanpa @
TELEGRAM_WEBHOOK_SECRET=random-secret-string
CRON_SECRET=random-cron-secret
SUPABASE_SERVICE_ROLE_KEY=...          # untuk webhook pairing + cron
```

3. Set webhook (sekali, ganti URL):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://premium-web-ruby.vercel.app/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

4. Cron Vercel (Hobby): sekali sehari **20:00 WIB** (`0 13 * * *`) — digest owner + reminder proyek. Jam preferensi di UI dipakai jika nanti pakai cron per jam (Vercel Pro) atau pemicu eksternal.

## User flow

1. Buka **Akun** → **Hubungkan Telegram**
2. Buka link → tekan **Start** di bot
3. Owner: aktifkan ringkasan harian + uji coba digest
4. Staff/akuntan (dengan add-on proyek): aktifkan reminder proyek

## Migrasi

`032_telegram_notifications.sql` — tabel `user_telegram_settings`, RPC `complete_telegram_link`.

## Kode

- `src/lib/telegram/` — bot, digest, reminders, cron
- `GET/POST /api/telegram/settings`
- `POST /api/telegram/webhook`
- `GET/POST /api/cron/telegram` (Bearer `CRON_SECRET`)
