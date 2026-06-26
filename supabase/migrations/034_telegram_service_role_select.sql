-- Telegram cron & /ringkasan: service_role baca data operasional (RLS bypass, perlu GRANT tabel)

GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO service_role;

COMMENT ON SCHEMA public IS
  'service_role: SELECT untuk worker Telegram/cron (key hanya di server).';
