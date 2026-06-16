# Client 2 — workspace deploy

Folder deploy terpisah untuk client kedua. **Client 1** tetap di repo root (`./scripts/deploy.sh`).

## Setup pertama kali

1. Baca checklist Word: `docs/Onboarding-Client-Baru-Akuntansi-App.docx`
2. Buat spreadsheet database + backend engine (clone template)
3. Clone Apps Script project (copy dari project client 1 di Google)
4. Isi file di folder ini:
   - `Config.js` → `DATABASE_ID`
   - `.clasp.json` → `scriptId` project Apps Script client 2
   - `client.env` (salin dari `client.env.example`)
5. Deploy web app di Google → catat `CLASP_DEPLOY_ID` (deployment `user`)
6. Isi sheet SETTING database client 2 (`BACKEND_ENGINE_ID`, `BACKEND_WEBAPP_URL`, `BACKEND_API_KEY`)
7. Isi `CLIENT_SPREADSHEET_ID` di backend engine client 2
8. `./deploy.sh "setup client 2"`
9. QA smoke test → serah terima URL ke client

## Deploy rutin (setelah fix di repo root)

```bash
cd clients/client2
./deploy.sh "fix: deskripsi"
```

Kode `.js` / `index.html` di-sync otomatis dari root; hanya `Config.js` di folder ini yang tetap milik client 2.

## Client 1 (yang sudah jalan)

Tetap deploy dari root:

```bash
cd /Users/arthamas/Spreadsheet4Anything
./scripts/deploy.sh "deskripsi"
```
