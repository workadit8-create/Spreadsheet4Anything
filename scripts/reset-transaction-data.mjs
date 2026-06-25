#!/usr/bin/env node
/**
 * Reset data transaksi — siapkan org seperti client baru.
 * Master data (COA, produk, pelanggan, pemasok, rekening kas) TIDAK dihapus.
 *
 * Usage:
 *   node scripts/reset-transaction-data.mjs                    # hybrid-lab, konfirmasi
 *   node scripts/reset-transaction-data.mjs --yes              # hybrid-lab, tanpa prompt
 *   node scripts/reset-transaction-data.mjs --slug=my-org --yes
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import pg from "./supabase-migrate/node_modules/pg/lib/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, "clients/hybrid/supabase.db.env");

function loadEnv(file) {
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
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

function parseArgs() {
  const args = process.argv.slice(2);
  let slug = "hybrid-lab";
  let yes = false;
  for (const arg of args) {
    if (arg === "--yes" || arg === "-y") yes = true;
    else if (arg.startsWith("--slug=")) slug = arg.slice("--slug=".length);
  }
  return { slug, yes };
}

async function confirm(slug) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(
      `Hapus SEMUA transaksi org "${slug}"? Master data tetap. Ketik RESET: `,
      resolve
    );
  });
  rl.close();
  return answer.trim() === "RESET";
}

async function deleteForOrg(client, orgId) {
  const counts = {};

  async function run(label, sql, params = [orgId]) {
    const res = await client.query(sql, params);
    counts[label] = res.rowCount ?? 0;
  }

  await client.query("BEGIN");

  await run(
    "posting_job_logs",
    `DELETE FROM posting_job_logs
     WHERE job_id IN (SELECT id FROM posting_jobs WHERE organization_id = $1)`
  );

  await run("posting_jobs", "DELETE FROM posting_jobs WHERE organization_id = $1");
  await run("journal_lines", "DELETE FROM journal_lines WHERE organization_id = $1");

  await client.query(
    "UPDATE journal_entries SET reverses_entry_id = NULL WHERE organization_id = $1",
    [orgId]
  );
  await run("journal_entries", "DELETE FROM journal_entries WHERE organization_id = $1");
  await run("cash_transfers", "DELETE FROM cash_transfers WHERE organization_id = $1");
  await run("payments", "DELETE FROM payments WHERE organization_id = $1");

  await run(
    "sales_lines",
    `DELETE FROM sales_lines
     WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE organization_id = $1)`
  );
  await run("sales_orders", "DELETE FROM sales_orders WHERE organization_id = $1");

  await run(
    "purchase_lines",
    `DELETE FROM purchase_lines
     WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id = $1)`
  );
  await run("purchase_orders", "DELETE FROM purchase_orders WHERE organization_id = $1");

  await run(
    "stock_movement_lines",
    `DELETE FROM stock_movement_lines
     WHERE movement_id IN (SELECT id FROM stock_movements WHERE organization_id = $1)`
  );
  await run("stock_movements", "DELETE FROM stock_movements WHERE organization_id = $1");

  await run(
    "stock_levels_zeroed",
    "UPDATE stock_levels SET qty = 0 WHERE organization_id = $1"
  );

  await run("idempotency_keys", "DELETE FROM idempotency_keys WHERE organization_id = $1");
  await run("sync_events", "DELETE FROM sync_events WHERE organization_id = $1");
  await run("product_cost_snapshots", "DELETE FROM product_cost_snapshots WHERE organization_id = $1");
  await run("crm_activities", "DELETE FROM crm_activities WHERE organization_id = $1");
  await run("pos_sessions", "DELETE FROM pos_sessions WHERE organization_id = $1");

  await client.query("COMMIT");
  return counts;
}

async function main() {
  const { slug, yes } = parseArgs();
  if (!fs.existsSync(ENV_FILE)) {
    console.error("Missing", ENV_FILE);
    process.exit(1);
  }
  loadEnv(ENV_FILE);

  const host = process.env.SUPABASE_DB_HOST;
  const user = process.env.SUPABASE_DB_USER;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const database = process.env.SUPABASE_DB_NAME || "postgres";
  const port = Number(process.env.SUPABASE_DB_PORT || 6543);

  if (!host || !user || !password) {
    console.error("SUPABASE_DB_* tidak lengkap di supabase.db.env");
    process.exit(1);
  }

  if (!yes) {
    const ok = await confirm(slug);
    if (!ok) {
      console.log("Dibatalkan.");
      process.exit(0);
    }
  }

  const client = new pg.Client({
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const orgRes = await client.query("SELECT id, name FROM organizations WHERE slug = $1", [slug]);
  if (!orgRes.rowCount) {
    console.error(`Organisasi slug "${slug}" tidak ditemukan.`);
    await client.end();
    process.exit(1);
  }

  const org = orgRes.rows[0];
  console.log(`==> Reset transaksi: ${org.name} (${slug})`);

  try {
    const counts = await deleteForOrg(client, org.id);
    console.log("==> Selesai. Baris terpengaruh:");
    for (const [table, n] of Object.entries(counts)) {
      console.log(`    ${table}: ${n}`);
    }
    console.log("\nMaster tetap: COA, kas/bank, produk, pelanggan, pemasok, gudang, resep.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("GAGAL — rollback:", e.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
