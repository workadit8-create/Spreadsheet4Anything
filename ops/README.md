# Akuntansi Ops Console (Fase 1)

Dashboard statis: registry semua akun + 3 link utama per client.

## Sync registry

Setelah ubah `client.env` atau provision client baru:

```bash
./scripts/sync-client-registry.sh
```

Output: `ops/client-registry.json` (tanpa API key — aman di-commit untuk GitHub Pages).

## Preview lokal

```bash
./ops/serve.sh
```

Buka http://localhost:8765

## GitHub Pages (akses dari mana saja, gratis)

1. Push repo ke GitHub
2. Jalankan sync + commit `ops/client-registry.json` dan `ops/index.html`
3. Repo **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: `main` (atau branch kamu)
   - Folder: **`/ops`**
4. URL: `https://<user>.github.io/Spreadsheet4Anything/` (atau custom path sesuai repo)

Setelah deploy client baru: sync registry → commit → push (Pages update ~1 menit).

## Link per akun

| Tombol | Sumber |
|--------|--------|
| Web App Akuntansi | `WEBAPP_URL` |
| Spreadsheet Database | `DATABASE_ID` |
| Backend Web App | `BACKEND_WEBAPP_URL` |

Folder Drive & backend engine spreadsheet ada di bagian "Drive & backend engine".
