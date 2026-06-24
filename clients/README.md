# Multi-client deploy (GAS Standard)

Satu repo kode, **deploy terpisah per client**. Folder di bawah ini adalah produk **Standard / Biasa**: web app GAS + spreadsheet sebagai database + BACKENDengine (Apps Script) untuk jurnal.

**Tidak sama dengan Premium** — lihat `apps/premium-web/` (Next.js + Supabase only, tanpa bridge ke sheet).

## Dua jalur produk di monorepo

| Produk | Folder | Database | Jurnal | Deploy UI |
|--------|--------|----------|--------|-----------|
| **Standard** (dev, demo, client1, …) | `clients/*` + repo root | Google Spreadsheet | BACKENDengine (GAS) | `clasp` / `deploy-to.sh` |
| **Premium** | `apps/premium-web/` | Supabase | `journal_entries` di Supabase | Vercel |

Kedua jalur **hidup berdampingan**. Perubahan Tahap D di Premium **tidak menghapus** kode GAS di folder client.

## Client GAS (Standard)

| Client | Folder deploy | Catatan |
|--------|---------------|---------|
| Client 1 (aktif) | Repo root | `./scripts/deploy.sh` |
| Sandbox dev | `clients/dev/` | `./scripts/deploy-to.sh dev` |
| Demo | `clients/demo/` | `./scripts/deploy-to.sh demo` |
| Hybrid lab | `clients/hybrid/` | Lab migrasi Premium; **tidak** sync dari root; `./scripts/deploy-to.sh hybrid` |
| Client 2 (siap setup) | `clients/client2/` | `./deploy.sh` di folder itu |
| Client baru | Salin `clients/_template` | Lihat checklist Word |

### `clients/hybrid/` — catatan

Folder ini dipakai untuk eksperimen Premium ↔ GAS (bridge `PremiumSync.js`, `api.js`). **Premium web (Tahap D) tidak memanggil bridge ini lagi** — jurnal langsung ke Supabase. Kode hybrid tetap ada untuk referensi / rollback / klien yang masih pakai pola sheet.

## Checklist onboarding

Checklist lengkap: `docs/Onboarding-Client-Baru-Akuntansi-App.docx`
