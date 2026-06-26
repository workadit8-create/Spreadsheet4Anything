# Telegram — Premium Web

Notifikasi via bot Telegram (platform-wide).

## Fitur

| Penerima | Isi | Default jam (WIB) |
|----------|-----|-------------------|
| **Owner** | Ringkasan harian + `/ringkasan` on-demand: posisi (kas/bank, piutang, utang), omset & laba bulan ini, pergerakan hari ini | 20:00 |
| **Tim** (add-on `project`) | Reminder tugas proyek jatuh tempo hari ini | 08:00 |

Angka digest = **CONFIRMED + POSTED** (operasional), exclude VOID.

## Bot produksi

- Username: **[@ownetassistantusahabot](https://t.me/ownetassistantusahabot)**
- `TELEGRAM_BOT_USERNAME=ownetassistantusahabot` (tanpa `@`)

## Setup bot (admin platform)

1. Token bot dari [@BotFather](https://t.me/BotFather) (jangan commit ke repo).
2. Set env di Vercel → **Production**:

```bash
TELEGRAM_BOT_TOKEN=<token dari BotFather>
TELEGRAM_BOT_USERNAME=ownetassistantusahabot
TELEGRAM_WEBHOOK_SECRET=<string acak, mis. openssl rand -hex 16>
CRON_SECRET=<string acak>
SUPABASE_SERVICE_ROLE_KEY=<dari Supabase Dashboard → API → service_role>
```

3. **Redeploy** production setelah env disimpan.
4. Set webhook (sekali, ganti `<TOKEN>` dan `<TELEGRAM_WEBHOOK_SECRET>`):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://premium-web-ruby.vercel.app/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

5. Verifikasi:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

4. Cron Vercel (Hobby): sekali sehari **20:00 WIB** (`0 13 * * *`) — digest owner + reminder proyek. Jam preferensi di UI dipakai jika nanti pakai cron per jam (Vercel Pro) atau pemicu eksternal.

## User flow

1. Buka **Akun** → **Hubungkan Telegram**
2. Buka link → tekan **Start** di bot
3. Owner: aktifkan ringkasan harian + uji coba digest; atau ketik `/ringkasan` di bot kapan saja
4. Staff/akuntan (dengan add-on proyek): aktifkan reminder proyek

## Perintah bot

| Perintah | Role | Isi |
|----------|------|-----|
| `/ringkasan` | Owner | Sama dengan digest harian (posisi + bulan ini + hari ini) |
| `/help` | Semua | Panduan singkat |
| `/start` | Semua | Pairing atau bantuan |

Cooldown `/ringkasan`: ~1 menit per chat.

## Migrasi

`032_telegram_notifications.sql` — tabel `user_telegram_settings`, RPC `complete_telegram_link`.

## Kode

- `src/lib/telegram/` — bot, digest, owner-ringkasan, reminders, cron
- `GET/POST /api/telegram/settings`
- `POST /api/telegram/webhook`
- `GET/POST /api/cron/telegram` (Bearer `CRON_SECRET`)
