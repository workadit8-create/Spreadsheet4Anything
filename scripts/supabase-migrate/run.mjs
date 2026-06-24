#!/usr/bin/env node
/**
 * Jalankan migration SQL ke Supabase Postgres (full install).
 * Butuh clients/hybrid/supabase.db.env dengan DATABASE_URL.
 *
 * Usage (dari repo root):
 *   ./scripts/run-supabase-migration.sh
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, "clients/hybrid/supabase.db.env");
const SQL_FILE = path.join(ROOT, "supabase/migrations/001_mvp_v1.sql");

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    console.error("File tidak ada:", file);
    console.error("Salin dari clients/hybrid/supabase.db.env.example lalu isi DATABASE_URL.");
    process.exit(1);
  }
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const line of lines) {
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
if (!url) {
  console.error("DATABASE_URL kosong di", ENV_FILE);
  process.exit(1);
}

const sql = fs.readFileSync(SQL_FILE, "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});

console.log("==> Connect Supabase Postgres...");
console.log("==> Migration:", SQL_FILE);

try {
  await client.connect();
  await client.query(sql);
  console.log("==> SUCCESS — schema MVP v1 + seed hybrid-lab");
} catch (err) {
  console.error("==> FAILED:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
