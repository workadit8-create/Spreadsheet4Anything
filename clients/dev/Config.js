// Konfigurasi client — GANTI DATABASE_ID sebelum deploy pertama.
// Salin folder ini ke clients/nama-client dan isi client.env + .clasp.json

const DATABASE_ID = "1w3UNhPBi-GjEBJbIzABJu9RE0fFE65HHv0l9p7QOoi8";

// Legacy — diganti sheet USERS; dikosongkan agar tidak bentrok.
const ALLOWED_EMAILS = [];

const USER_ROLES_ = ["owner", "staff", "akuntan"];
const ROLE_MENUS_ = {
  owner: null,
  staff: ["dashboard", "mutasi", "quotation", "proyek", "pemasukan", "invoice", "piutang", "pr", "pembelian", "po", "hutang", "master"],
  akuntan: ["dashboard", "mutasi", "piutang", "hutang", "jurnal", "posting", "master", "laporan", "proyek"]
};

/** Add-on Manajemen Proyek — sandbox dev. */
const ENABLE_ADDON_PROJECT = true;

/** Role yang boleh mengubah tiap entitas master (save / nonaktifkan). */
const MASTER_ENTITY_ROLES_ = {
  customer: ["owner", "staff", "akuntan"],
  produk: ["owner", "staff", "akuntan"],
  supplier: ["owner", "staff", "akuntan"],
  kasBank: ["owner"],
  kategoriPembelian: ["owner", "akuntan"],
  coa: ["owner", "akuntan"]
};

const MASTER_ENTITY_LABELS_ = {
  customer: "Customer",
  produk: "Produk",
  supplier: "Supplier",
  kasBank: "Kas & Bank",
  kategoriPembelian: "Kategori Pembelian",
  coa: "Chart of Accounts"
};

let CURRENT_AUTH_USER_ = null;

/** Nama tampilan di sidebar / layar login (per client). */
const APP_DISPLAY_NAME = "DEPLOY TESTING";

function getAppDisplayName_() {
  const name = String(typeof APP_DISPLAY_NAME !== "undefined" ? APP_DISPLAY_NAME : "").trim();
  return name || "UMKM JAYA";
}
