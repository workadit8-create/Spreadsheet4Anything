#!/usr/bin/env node
/**
 * Backfill cash_transfers dari pembelian/penjualan/pelunasan historis (sekali jalan).
 * Usage: node scripts/backfill-linked-mutasi.mjs
 */
import fs from "fs";
import path from "path";
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
    if (val) process.env[m[1]] = val;
  }
}

function resolveAccount(rekening, accounts) {
  const key = String(rekening || "").trim();
  if (!key) return null;
  const exact = accounts.find((a) => a.name === key || a.coa_account_name === key);
  if (exact) return exact;
  const lower = key.toLowerCase();
  return accounts.find(
    (a) => a.name.toLowerCase() === lower || a.coa_account_name.toLowerCase() === lower
  );
}

function transferNo() {
  const d = new Date();
  return `MB-PW-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 9000) + 1000}`;
}

async function insertIfNew(client, row) {
  const exists = await client.query(
    "select 1 from cash_transfers where organization_id = $1 and transaction_id = $2",
    [row.organization_id, row.transaction_id]
  );
  if (exists.rowCount) return false;
  await client.query(
    `insert into cash_transfers (
      organization_id, transfer_no, transfer_date, kind,
      source_account_id, source_account_name, source_coa_name,
      dest_account_id, dest_account_name, dest_coa_name,
      contra_coa_name, amount, keterangan, transaction_id, status, metadata
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      row.organization_id, row.transfer_no, row.transfer_date, row.kind,
      row.source_account_id, row.source_account_name, row.source_coa_name,
      row.dest_account_id, row.dest_account_name, row.dest_coa_name,
      row.contra_coa_name, row.amount, row.keterangan, row.transaction_id, row.status,
      JSON.stringify(row.metadata)
    ]
  );
  return true;
}

loadEnv(ENV_FILE);
const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 6543),
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || "postgres",
  ssl: { rejectUnauthorized: false }
});

await client.connect();
let inserted = 0;

const accounts = (await client.query(
  "select id, organization_id, name, coa_account_name from cash_bank_accounts where active = true"
)).rows;

const accountsByOrg = new Map();
for (const a of accounts) {
  const bucket = accountsByOrg.get(a.organization_id) || [];
  bucket.push(a);
  accountsByOrg.set(a.organization_id, bucket);
}

const pos = (await client.query(
  "select id, organization_id, po_no, order_date, status, metadata from purchase_orders where status != 'DRAFT'"
)).rows;
const plines = (await client.query("select purchase_order_id, description, metadata from purchase_lines")).rows;
const plByPo = new Map();
for (const l of plines) {
  const b = plByPo.get(l.purchase_order_id) || [];
  b.push(l);
  plByPo.set(l.purchase_order_id, b);
}

for (const po of pos) {
  if (po.status === "VOIDED") continue;
  const meta = po.metadata || {};
  const rekening = resolveAccount(meta.rekening, accountsByOrg.get(po.organization_id) || []);
  if (!rekening) continue;
  for (const line of plByPo.get(po.id) || []) {
    const lm = line.metadata || {};
    const bayar = Number(lm.bayar) || 0;
    if (bayar <= 0) continue;
    const txId = lm.transactionId
      ? `LINK-PB-${String(lm.transactionId).replace(/[^a-zA-Z0-9_-]/g, "")}`
      : `LINK-PB-${po.id}-${line.description}`.slice(0, 100);
    const ok = await insertIfNew(client, {
      organization_id: po.organization_id,
      transfer_no: transferNo(),
      transfer_date: po.order_date,
      kind: "Keluar",
      source_account_id: rekening.id,
      source_account_name: rekening.name,
      source_coa_name: rekening.coa_account_name,
      dest_account_id: null,
      dest_account_name: String(meta.supplierName || "Supplier"),
      dest_coa_name: null,
      contra_coa_name: String(meta.supplierName || "Supplier"),
      amount: bayar,
      keterangan: `Pembelian ${line.description}`,
      transaction_id: txId,
      status: "POSTED",
      metadata: {
        linked: true,
        sourceType: "PURCHASE_ORDER",
        sourceId: po.id,
        journalHandledBy: "PEMBELIAN",
        backfill: true
      }
    });
    if (ok) inserted += 1;
  }
}

const sos = (await client.query(
  "select id, organization_id, order_no, order_date, status, metadata from sales_orders where status != 'DRAFT'"
)).rows;
const slines = (await client.query("select sales_order_id, metadata from sales_lines")).rows;
const slBySo = new Map();
for (const l of slines) {
  const b = slBySo.get(l.sales_order_id) || [];
  b.push(l);
  slBySo.set(l.sales_order_id, b);
}

for (const so of sos) {
  if (so.status === "VOIDED") continue;
  const meta = so.metadata || {};
  const rekening = resolveAccount(meta.rekening, accountsByOrg.get(so.organization_id) || []);
  const lines = slBySo.get(so.id) || [];
  const lineBayar = lines.reduce((s, l) => s + (Number(l.metadata?.bayar) || 0), 0);
  const totalBayar = lineBayar || Number(meta.bayar) || 0;
  if (!rekening || totalBayar <= 0) continue;
  const txId = meta.transactionId
    ? `LINK-SO-${String(meta.transactionId).replace(/[^a-zA-Z0-9_-]/g, "")}`
    : `LINK-SO-${so.id}`;
  const ok = await insertIfNew(client, {
    organization_id: so.organization_id,
    transfer_no: transferNo(),
    transfer_date: so.order_date,
    kind: "Masuk",
    source_account_id: null,
    source_account_name: null,
    source_coa_name: null,
    dest_account_id: rekening.id,
    dest_account_name: rekening.name,
    dest_coa_name: rekening.coa_account_name,
    contra_coa_name: null,
    amount: totalBayar,
    keterangan: `Pembayaran ${so.order_no}`,
    transaction_id: txId,
    status: "POSTED",
    metadata: {
      linked: true,
      sourceType: "SALES_ORDER",
      sourceId: so.id,
      journalHandledBy: "PEMASUKAN",
      backfill: true
    }
  });
  if (ok) inserted += 1;
}

const payments = (await client.query(
  "select id, organization_id, doc_type, doc_id, amount, status, method, metadata, paid_at::date as paid_date from payments where doc_type in ('UTANG_PAYMENT','PIUTANG_PAYMENT')"
)).rows;

for (const p of payments) {
  if (p.status === "VOIDED") continue;
  const meta = p.metadata || {};
  const rekening = resolveAccount(meta.rekening || p.method, accountsByOrg.get(p.organization_id) || []);
  if (!rekening) continue;
  const amount = Number(p.amount) || 0;
  if (amount <= 0) continue;
  const txKey = meta.transactionId
    ? String(meta.transactionId).replace(/[^a-zA-Z0-9_-]/g, "")
    : p.id;
  const prefix = p.doc_type === "UTANG_PAYMENT" ? "UT" : "PI";
  const isKeluar = p.doc_type === "UTANG_PAYMENT";
  const label = isKeluar
    ? String(meta.supplierName || meta.poNo || "Supplier")
    : `Customer: ${String(meta.customerName || meta.invoiceNo || "")}`;
  const ok = await insertIfNew(client, {
    organization_id: p.organization_id,
    transfer_no: transferNo(),
    transfer_date: meta.tanggalBayar || p.paid_date,
    kind: isKeluar ? "Keluar" : "Masuk",
    source_account_id: isKeluar ? rekening.id : null,
    source_account_name: isKeluar ? rekening.name : null,
    source_coa_name: isKeluar ? rekening.coa_account_name : null,
    dest_account_id: isKeluar ? null : rekening.id,
    dest_account_name: isKeluar ? label : rekening.name,
    dest_coa_name: isKeluar ? null : rekening.coa_account_name,
    contra_coa_name: isKeluar ? label : null,
    amount,
    keterangan: String(meta.keterangan || (isKeluar ? `Pelunasan ${meta.poNo || ""}` : `Pelunasan ${meta.invoiceNo || ""}`)),
    transaction_id: `LINK-${prefix}-${txKey}`,
    status: "POSTED",
    metadata: {
      linked: true,
      sourceType: p.doc_type,
      sourceId: p.id,
      journalHandledBy: isKeluar ? "PELUNASAN_UTANG" : "PELUNASAN_PIUTANG",
      backfill: true
    }
  });
  if (ok) inserted += 1;
}

await client.end();
console.log(`==> Backfill selesai: ${inserted} mutasi linked ditambahkan`);
