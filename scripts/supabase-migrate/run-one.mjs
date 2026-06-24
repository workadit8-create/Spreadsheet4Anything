#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../");
const ENV_FILE = path.join(ROOT, "clients/hybrid/supabase.db.env");
const migrationArg = process.argv[2] || "008_multi_business_inventory_foundation.sql";
const SQL_FILE = path.join(ROOT, "supabase/migrations", migrationArg);

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    console.error("File tidak ada:", file);
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
if (!url) {
  console.error("DATABASE_URL kosong");
  process.exit(1);
}

const sql = fs.readFileSync(SQL_FILE, "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

console.log("==> Migration:", SQL_FILE);

try {
  await client.connect();
  await client.query(sql);

  const check = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'product_categories' AND column_name = 'tracks_stock'"
  );
  const cats = await client.query(
    "SELECT code, name, tracks_stock, product_kind FROM product_categories WHERE organization_id = (SELECT id FROM organizations WHERE slug = 'hybrid-lab') ORDER BY sort_order"
  );
  console.log("==> tracks_stock column:", check.rows.length > 0 ? "OK" : "MISSING");
  console.log("==> Kategori hybrid-lab:", cats.rows.length);
  cats.rows.forEach((r) => console.log(`   ${r.code} | ${r.name} | stok=${r.tracks_stock} | ${r.product_kind}`));
  console.log("==> SUCCESS");
} catch (err) {
  console.error("==> FAILED:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
