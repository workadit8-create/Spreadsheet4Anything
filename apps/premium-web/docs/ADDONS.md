# Add-on per organisasi — Premium Web

Setiap client punya baris di `tenant_addons`. Menu & API modul add-on hanya muncul jika `enabled = true`.

## Katalog

| Key | Modul | Status |
|-----|--------|--------|
| `project` | Manajemen Proyek | Pilot — hybrid-lab |
| `pos` | POS | Belum |
| `pos_gramasi` | POS Gramasi | Belum |
| `crm` | CRM | Belum |

## Pengujian (hybrid-lab)

```bash
./scripts/run-supabase-migration-file.sh enable-project-addon-hybrid-lab.sql
```

Login `workadit8@gmail.com` → sidebar **Proyek** muncul.

Client produksi (Tirta, dll.) tidak melihat menu sampai add-on diaktifkan via SQL admin.

## Kode

- `src/lib/org/addons.ts` — `fetchOrgAddons`, `isAddonEnabled`, `requireAddon`
- `GET /api/org/addons` — daftar add-on org aktif
- `PATCH /api/org/addons` — toggle (hanya slug `hybrid-lab`)

## Aktifkan untuk client produksi

```sql
UPDATE tenant_addons ta
SET enabled = true, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug = 'tirta-catering'
  AND ta.addon_key = 'project';
```
