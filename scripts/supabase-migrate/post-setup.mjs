#!/usr/bin/env node
/**
 * Post-setup hybrid lab: cek schema + hubungkan user Auth ke tenant hybrid-lab.
 * Butuh clients/hybrid/supabase.db.env
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../");
const ENV_FILE = path.join(ROOT, "clients/hybrid/supabase.db.env");

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    console.error("Tidak ada:", file);
    process.exit(1);
  }
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val) process.env[m[1]] = val;
  }
}

loadEnv(ENV_FILE);

const url = process.env.DATABASE_URL;
const email = process.env.LAB_USER_EMAIL;
if (!url) {
  console.error("DATABASE_URL kosong");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const tables = await client.query(`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  `);
  if (!tables.rows[0]?.n) {
    console.error("Tabel organizations tidak ada — jalankan ./scripts/run-supabase-migration.sh dulu");
    process.exit(1);
  }

  const org = await client.query(`SELECT id, slug, name FROM organizations WHERE slug = 'hybrid-lab'`);
  if (!org.rows.length) {
    console.error("Tenant hybrid-lab tidak ada — jalankan migration 001");
    process.exit(1);
  }
  console.log("OK tenant:", org.rows[0].name, org.rows[0].id);

  if (!email) {
    console.log("Skip membership — LAB_USER_EMAIL tidak diisi di supabase.db.env");
    process.exit(0);
  }

  const users = await client.query(`SELECT id, email FROM auth.users WHERE email = $1`, [email]);
  if (!users.rows.length) {
    console.error("User Auth tidak ditemukan untuk email:", email);
    console.error("Buat dulu di Supabase → Authentication → Users");
    process.exit(1);
  }

  await client.query(
    `INSERT INTO memberships (organization_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (organization_id, user_id) DO NOTHING`,
    [org.rows[0].id, users.rows[0].id]
  );
  console.log("OK membership owner untuk:", email);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
