# Add-on per organisasi — Premium Web

Setiap client punya baris di `tenant_addons`. Menu & API modul add-on hanya muncul jika `enabled = true`.

## Katalog

| Key | Modul | Status |
|-----|--------|--------|
| `project` | Manajemen Proyek | Pilot — hybrid-lab (fase 2: CRUD, checklist, L/R) |
| `pos` | POS (Kasir) | Pilot — hybrid-lab, tirta-catering |
| `outlet` | Multi Outlet | Pilot — hybrid-lab (L/R per outlet, tag transaksi) |
| `pos_gramasi` | POS Gramasi | Belum |
| `crm` | CRM | Belum |

## Pengujian (hybrid-lab)

Add-on diaktifkan oleh **admin platform** (`PLATFORM_ADMIN_EMAILS`), bukan owner client. Lihat [`docs/ROLES.md`](docs/ROLES.md).

Client produksi (Tirta, dll.) tidak melihat menu sampai add-on diaktifkan via SQL admin.

## Kode

- `src/lib/org/addons.ts` — `fetchOrgAddons`, `isAddonEnabled`, `requireAddon`
- `GET /api/org/addons` — daftar add-on org aktif
- `PATCH /api/org/addons` — toggle (hanya slug `hybrid-lab`)
- `GET/POST /api/projects` — daftar & simpan proyek
- `GET /api/projects/[code]/tasks` — checklist
- `POST /api/projects/[code]/tasks/init` — seed template (wedding/corporate/kecil)
- `GET /api/projects/lr` — laporan L/R per proyek (dari invoice & PO bertag `project_code`)

Tabel: `projects`, `project_tasks` (migration `024_projects.sql`).

Dropdown **Proyek event** muncul di Quotation, Invoice, PR, dan PO jika add-on `project` aktif (data dari bootstrap API).

## Aktifkan untuk client produksi

```sql
UPDATE tenant_addons ta
SET enabled = true, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug = 'tirta-catering'
  AND ta.addon_key = 'project';
```
