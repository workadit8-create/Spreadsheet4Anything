# Template client — Akuntansi App

Folder ini adalah template untuk onboarding client baru.

## Buat client baru

```bash
cp -R clients/_template clients/nama-client
cd clients/nama-client
cp client.env.example client.env
# Edit Config.js, .clasp.json, client.env
chmod +x deploy.sh
```

Ikuti checklist Word: `docs/Onboarding-Client-Baru-Akuntansi-App.docx`

## Deploy rutin (setelah bug fix di repo root)

```bash
./deploy.sh "deskripsi perubahan"
```

Script akan sync semua `.js` dari root (kecuali `Config.js`) lalu push ke Apps Script project client ini.
