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

function buildPgConfig(portOverride) {
  const host = process.env.SUPABASE_DB_HOST;
  const user = process.env.SUPABASE_DB_USER;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const database = process.env.SUPABASE_DB_NAME || "postgres";
  const port = portOverride ?? Number(process.env.SUPABASE_DB_PORT || 5432);

  if (host && user && password) {
    return {
      host,
      port,
      user,
      password,
      database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000
    };
  }

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1"
    ) {
      throw new Error(
        "DATABASE_URL ter-parse ke localhost. Password kemungkinan ada karakter / @ # % + — " +
          "pakai SUPABASE_DB_HOST/USER/PASSWORD terpisah di supabase.db.env (lihat .example)."
      );
    }
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "DATABASE_URL tidak valid. Jika password ada karakter khusus, pakai SUPABASE_DB_* terpisah."
      );
    }
    throw e;
  }

  return {
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000
  };
}

function formatError(err) {
  if (err?.message) return err.message;
  if (err?.code === "ECONNREFUSED") {
    const nested = err.errors?.map((e) => e.message).filter(Boolean);
    if (nested?.length) return `ECONNREFUSED (${nested.join("; ")})`;
    return "ECONNREFUSED — cek host/port atau pakai SUPABASE_DB_* terpisah";
  }
  return String(err);
}

loadEnv(ENV_FILE);

let pgConfig;
try {
  pgConfig = buildPgConfig();
} catch (err) {
  console.error("==> FAILED:", formatError(err));
  process.exit(1);
}

if (!pgConfig) {
  console.error("Isi SUPABASE_DB_HOST/USER/PASSWORD atau DATABASE_URL di", ENV_FILE);
  process.exit(1);
}

const sql = fs.readFileSync(SQL_FILE, "utf8");

async function runMigration(pgConfig) {
  const client = new pg.Client(pgConfig);
  try {
    await client.connect();
    await client.query(sql);
    return true;
  } finally {
    await client.end();
  }
}

console.log("==> Connect Supabase Postgres...");
if (pgConfig.host) {
  console.log("==> Host:", `${pgConfig.host}:${pgConfig.port}`);
}
console.log("==> Migration:", SQL_FILE);

const fallbackPort = pgConfig.port === 5432 ? 6543 : pgConfig.port === 6543 ? 5432 : null;

try {
  await runMigration(pgConfig);
  console.log("==> SUCCESS");
} catch (err) {
  if (err.message === "timeout expired" && fallbackPort && pgConfig.host) {
    console.error("==> Port", pgConfig.port, "timeout — coba port", fallbackPort, "...");
    try {
      await runMigration({ ...pgConfig, port: fallbackPort });
      console.log("==> SUCCESS (port", fallbackPort + ")");
      process.exit(0);
    } catch (retryErr) {
      console.error("==> FAILED:", formatError(retryErr));
      process.exit(1);
    }
  }

  console.error("==> FAILED:", formatError(err));
  if (err.code === "ENOTFOUND" && /db\.[a-z0-9]+\.supabase\.co/i.test(process.env.DATABASE_URL || "")) {
    console.error("");
    console.error("Host db.*.supabase.co sering hanya punya IPv6 (tidak resolve di jaringan IPv4).");
    console.error("Pakai Session pooler: Connect → Session pooler → copy host/user ke supabase.db.env");
  }
  if (err.code === "28P01") {
    console.error("");
    console.error("Password salah. Reset di Database → Settings → Reset database password.");
  }
  if (err.message === "timeout expired") {
    console.error("");
    console.error("Port 5432 diblokir jaringan? Set SUPABASE_DB_PORT=6543 di supabase.db.env");
    console.error("Atau jalankan SQL di Supabase → SQL Editor.");
  }
  process.exit(1);
}
