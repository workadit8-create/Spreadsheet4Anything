#!/usr/bin/env node
/**
 * Hapus deployment Apps Script yang tidak dipakai.
 * Versi TIDAK bisa dihapus via API — setelah ini, bulk delete di Histori Project.
 *
 * Usage:
 *   node scripts/cleanup-deployments.mjs --dry-run
 *   node scripts/cleanup-deployments.mjs --execute
 */

import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const KEEP_DEPLOYMENTS = new Set([
  // URL produksi yang dipakai user
  "AKfycbzgw08PULf6FhWjiA4FlIqrRhuikcpwNnvIt02sD9I8rLzL0WprwATGTsWsdk_-TsQt"
]);

const execute = process.argv.includes("--execute");
const dryRun = !execute || process.argv.includes("--dry-run");

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = execSync("clasp deployments --json", { cwd: projectDir, encoding: "utf8" });
const deployments = JSON.parse(raw);

const toDelete = deployments.filter((d) => !KEEP_DEPLOYMENTS.has(d.deploymentId));
const kept = deployments.filter((d) => KEEP_DEPLOYMENTS.has(d.deploymentId));

console.log("=== Cleanup Apps Script Deployments ===");
console.log("Total deployment:", deployments.length);
console.log("Akan dipertahankan:", kept.length);
kept.forEach((d) => {
  console.log("  KEEP", d.deploymentId, d.description || "", "v" + (d.versionNumber || "HEAD"));
});
console.log("Akan dihapus:", toDelete.length);

if (dryRun && !execute) {
  console.log("\n[DRY RUN] Tambahkan --execute untuk hapus benar-benar.");
  console.log("Contoh 5 yang akan dihapus:");
  toDelete.slice(0, 5).forEach((d) => {
    console.log("  DELETE", d.deploymentId, d.description || "", "v" + (d.versionNumber || "?"));
  });
  process.exit(0);
}

let ok = 0;
let fail = 0;
for (const d of toDelete) {
  try {
    execSync(`clasp undeploy ${d.deploymentId}`, { cwd: projectDir, stdio: "pipe" });
    ok++;
    if (ok % 10 === 0) console.log(`  ... ${ok}/${toDelete.length} terhapus`);
  } catch (e) {
    fail++;
    console.error("GAGAL", d.deploymentId, e.stderr?.toString() || e.message);
  }
}

console.log("\nSelesai. Terhapus:", ok, "Gagal:", fail);
console.log("\nLangkah berikutnya (manual di browser):");
console.log("1. Apps Script Editor → Histori Project (ikon jam)");
console.log("2. Klik 'Hapus versi massal' / 'Bulk delete versions'");
console.log("3. Pilih semua → Hapus");
console.log("\nKe depan: Deploy → Kelola deployment → Edit → Versi baru (jangan buat deployment baru tiap kali).");
