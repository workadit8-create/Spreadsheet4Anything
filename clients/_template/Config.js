// Konfigurasi client — GANTI DATABASE_ID sebelum deploy pertama.
// Salin folder ini ke clients/nama-client dan isi client.env + .clasp.json

const DATABASE_ID = "GANTI_DENGAN_ID_SPREADSHEET_DATABASE_CLIENT";

// Legacy — diganti sheet USERS; dikosongkan agar tidak bentrok.
const ALLOWED_EMAILS = [];

const USER_ROLES_ = ["owner", "staff", "akuntan"];
const ROLE_MENUS_ = {
  owner: null,
  staff: ["dashboard", "mutasi", "quotation", "pemasukan", "invoice", "piutang", "pr", "pembelian", "po", "hutang", "master"],
  akuntan: ["dashboard", "mutasi", "piutang", "hutang", "jurnal", "posting", "master", "laporan"]
};

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
