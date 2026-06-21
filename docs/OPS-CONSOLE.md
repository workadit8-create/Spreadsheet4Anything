# Akuntansi Ops Console (Fase 1)

Dashboard statis: registry semua akun + 3 link utama per client.

## Sync registry

Setelah ubah `client.env` atau provision client baru:

```bash
./scripts/sync-client-registry.sh
```

Output: `docs/client-registry.json` (tanpa API key — aman di-commit untuk GitHub Pages).

## Preview lokal

```bash
./docs/serve.sh
```

Buka http://localhost:8765

## GitHub Pages (akses dari mana saja, gratis)

GitHub Pages **hanya** mendukung folder **`/docs`** atau **`/` (root)** — bukan `/ops`.

1. Push repo ke GitHub
2. Jalankan sync + commit `docs/client-registry.json` dan `docs/index.html`
3. Repo **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **`/docs`**
4. Save — URL: `https://workadit8-create.github.io/Spreadsheet4Anything/`

Setelah client baru: sync registry → commit → push (~1 menit update).

## Link per akun

| Tombol | Sumber |
|--------|--------|
| Web App Akuntansi | `WEBAPP_URL` |
| Spreadsheet Database | `DATABASE_ID` |
| Backend Web App | `BACKEND_WEBAPP_URL` |

Folder Drive & backend engine spreadsheet ada di bagian "Drive & backend engine".
