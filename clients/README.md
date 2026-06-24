# Multi-client deploy

Satu repo kode, **deploy terpisah per client**.

| Client | Folder deploy | Catatan |
|--------|---------------|---------|
| Client 1 (aktif) | Repo root | `./scripts/deploy.sh` |
| Sandbox dev | `clients/dev/` | `./scripts/deploy-to.sh dev` |
| Demo | `clients/demo/` | `./scripts/deploy-to.sh demo` |
| **Hybrid lab** | `clients/hybrid/` | Migrasi Premium — **tidak** sync root; `./scripts/deploy-to.sh hybrid` |
| Client 2 (siap setup) | `clients/client2/` | `./deploy.sh` di folder itu |
| Client baru | Salin `clients/_template` | Lihat checklist Word |

Checklist lengkap: `docs/Onboarding-Client-Baru-Akuntansi-App.docx`
