#!/usr/bin/env node
/**
 * Jalankan satu file migration SQL ke Supabase Postgres.
 * Dipanggil via scripts/run-supabase-migration-file.sh
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../");
const ENV_FILE = path.join(ROOT, "clients/hybrid/supabase.db.env");
const SQL_FILE = process.env.MIGRATION_SQL_FILE;

if (!SQL_FILE || !fs.existsSync(SQL_FILE)) {
  console.error("MIGRATION_SQL_FILE tidak valid:", SQL_FILE);
  process.exit(1);
}

function loadEnv(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
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
  console.log("==> SUCCESS");
} catch (err) {
  console.error("==> FAILED:", err.message);
  if (
    err.code === "ENOTFOUND" &&
    /db\.[a-z0-9]+\.supabase\.co/i.test(url)
  ) {
    console.error("");
    console.error("Host db.*.supabase.co sering hanya punya IPv6 (tidak resolve di jaringan IPv4).");
    console.error("Perbaikan:");
    console.error("  1. Supabase Dashboard → Project Settings → Database");
    console.error("  2. Connection string → URI → pilih Session pooler (port 5432)");
    console.error("  3. Update DATABASE_URL di clients/hybrid/supabase.db.env");
    console.error("     Format: postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres");
    console.error("");
    console.error("Alternatif: jalankan SQL di Supabase → SQL Editor (copy isi file migration).");
  }
  process.exit(1);
} finally {
  await client.end();
}
