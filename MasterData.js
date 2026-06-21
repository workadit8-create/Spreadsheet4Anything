// Master Data (Customer, Produk, Kas/Bank, Supplier, COA)
// ==========================================
// MASTER DATA (Fase 1: Customer, Produk, Kas/Bank)
// ==========================================

var MASTER_DATA_CACHE_TTL_ = 600;

function masterCacheKey_(name) {
  return "master_" + name;
}

function getMasterDataCache_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    if (raw) return JSON.parse(raw);
  } catch (ignore) {}
  return null;
}

function setMasterDataCache_(key, value) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), MASTER_DATA_CACHE_TTL_);
  } catch (ignore) {}
}

function invalidateMasterDataCache_() {
  try {
    const cache = CacheService.getScriptCache();
    [
      "customers_active", "customers_all", "customers_names",
      "produk_active", "produk_all", "products_dto",
      "kasbank_active", "kasbank_all", "kasbank_dto",
      "supplier_active", "supplier_all", "suppliers_names",
      "kategori_active", "kategori_all", "pembelian_map",
      "coa_active", "coa_all"
    ].forEach(function(k) { cache.remove(masterCacheKey_(k)); });
  } catch (ignore) {}
  try {
    resetKategoriAccountMap_();
  } catch (ignore) {}
}

function masterListCached_(key, loader) {
  const cached = getMasterDataCache_(masterCacheKey_(key));
  if (cached) return cached;
  const result = loader();
  setMasterDataCache_(masterCacheKey_(key), result);
  return result;
}

function masterIsActive_(val) {
  if (val === false) return false;
  const s = String(val || "").trim().toUpperCase();
  return s !== "TIDAK" && s !== "N" && s !== "NONAKTIF" && s !== "0";
}

function ensureMasterCustomerSheet_(ss) {
  let sh = ss.getSheetByName("MASTER_CUSTOMER");
  if (!sh) {
    sh = ss.insertSheet("MASTER_CUSTOMER");
    sh.appendRow(["ID", "Nama", "Telepon", "Email", "Alamat", "Aktif"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureMasterProdukSheet_(ss) {
  let sh = ss.getSheetByName("MASTER_PRODUK");
  if (!sh) {
    sh = ss.insertSheet("MASTER_PRODUK");
    sh.appendRow(["ID", "Kode", "Nama", "Satuan", "Harga", "Akun Pendapatan", "Aktif"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureMasterKasBankSheet_(ss) {
  let sh = ss.getSheetByName("MASTER_KAS_BANK");
  if (!sh) {
    sh = ss.insertSheet("MASTER_KAS_BANK");
    sh.appendRow(["ID", "Kode", "Nama Rekening", "Nama Akun COA", "Aktif"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureMasterSupplierSheet_(ss) {
  let sh = ss.getSheetByName("MASTER_SUPPLIER");
  if (!sh) {
    sh = ss.insertSheet("MASTER_SUPPLIER");
    sh.appendRow(["ID", "Nama", "Telepon", "Email", "Alamat", "Aktif"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureMasterKategoriPembelianSheet_(ss) {
  let sh = ss.getSheetByName("MASTER_KATEGORI_PEMBELIAN");
  if (!sh) {
    sh = ss.insertSheet("MASTER_KATEGORI_PEMBELIAN");
    sh.appendRow(["ID", "Kategori", "Sub-Kategori", "Akun COA", "Aktif"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function masterNextId_(prefix, sh) {
  const last = Math.max(1, sh.getLastRow() - 1);
  return prefix + "-" + String(last + 1).padStart(4, "0");
}

function masterReadDataRange_(sh, colCount) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  return sh.getRange(2, 1, lastRow, colCount).getValues();
}

function masterWriteRows_(sh, startRow, rows, colCount) {
  if (!rows || !rows.length) return;
  sh.getRange(startRow, 1, rows.length, colCount).setValues(rows);
}

function masterWriteRow_(sh, rowNum, row, colCount) {
  sh.getRange(rowNum, 1, 1, colCount).setValues([row]);
}

function migrateLegacyMasterCustomers_(ss) {
  const shNew = ensureMasterCustomerSheet_(ss);
  if (shNew.getLastRow() > 1) return;

  const shOld = ss.getSheetByName("Master") || ss.getSheetByName("MASTER");
  if (!shOld || shOld.getLastRow() < 2) return;

  const names = shOld.getRange("K2:K" + shOld.getLastRow()).getValues().flat();
  const seen = {};
  const rows = [];
  names.forEach(function(n) {
    const nama = String(n || "").trim();
    if (!nama || seen[nama]) return;
    seen[nama] = true;
    rows.push([
      "CUST-" + String(rows.length + 1).padStart(4, "0"),
      nama, "", "", "", "YA"
    ]);
  });
  if (rows.length) {
    masterWriteRows_(shNew, 2, rows, 6);
  }
}

function migrateLegacyMasterProduk_(ss) {
  const shNew = ensureMasterProdukSheet_(ss);
  if (shNew.getLastRow() > 1) return;

  const shOld = ss.getSheetByName("Master") || ss.getSheetByName("MASTER");
  if (!shOld || shOld.getLastRow() < 2) return;

  const data = shOld.getRange("B2:I" + shOld.getLastRow()).getValues();
  const seen = {};
  const rows = [];
  data.forEach(function(row) {
    const nama = String(row[1] || "").trim();
    if (!nama || seen[nama]) return;
    seen[nama] = true;
    rows.push([
      "PRD-" + String(rows.length + 1).padStart(4, "0"),
      String(row[0] || "").trim(),
      nama,
      String(row[2] || "").trim(),
      Number(row[4]) || 0,
      String(row[7] || "PENDAPATAN").trim() || "PENDAPATAN",
      "YA"
    ]);
  });
  if (rows.length) {
    masterWriteRows_(shNew, 2, rows, 7);
  }
}

function migrateLegacyMasterKasBank_(ss) {
  const shNew = ensureMasterKasBankSheet_(ss);
  if (shNew.getLastRow() > 1) return;

  const shOld = ss.getSheetByName("Master") || ss.getSheetByName("MASTER");
  if (!shOld || shOld.getLastRow() < 2) return;

  const data = shOld.getRange("Y2:Z" + shOld.getLastRow()).getValues();
  const rows = [];
  data.forEach(function(row) {
    const kode = String(row[0] || "").trim();
    const nama = String(row[1] || "").trim();
    if (!nama) return;
    rows.push([
      "KB-" + String(rows.length + 1).padStart(4, "0"),
      kode,
      nama,
      nama,
      "YA"
    ]);
  });
  if (rows.length) {
    masterWriteRows_(shNew, 2, rows, 5);
  }
}

function migrateLegacyMasterSuppliers_(ss) {
  const shNew = ensureMasterSupplierSheet_(ss);
  if (shNew.getLastRow() > 1) return;

  const seen = {};
  const rows = [];

  const addName = function(nama) {
    const n = String(nama || "").trim();
    if (!n || seen[n]) return;
    seen[n] = true;
    rows.push([
      "SUP-" + String(rows.length + 1).padStart(4, "0"),
      n, "", "", "", "YA"
    ]);
  };

  const shPb = ss.getSheetByName("PEMBELIAN");
  if (shPb && shPb.getLastRow() >= 2) {
    shPb.getRange(2, 3, shPb.getLastRow(), 3).getValues().forEach(function(r) {
      addName(r[0]);
    });
  }

  const shPr = ss.getSheetByName("PURCHASE_REQUEST");
  if (shPr && shPr.getLastRow() >= 2) {
    shPr.getRange(2, 3, shPr.getLastRow(), 3).getValues().forEach(function(r) {
      addName(r[0]);
    });
  }

  if (rows.length) {
    masterWriteRows_(shNew, 2, rows, 6);
  }
}

function migrateLegacyMasterKategoriPembelian_(ss) {
  const shNew = ensureMasterKategoriPembelianSheet_(ss);
  if (shNew.getLastRow() > 1) return;

  const shOld = ss.getSheetByName("Master") || ss.getSheetByName("MASTER");
  if (!shOld || shOld.getLastRow() < 2) return;

  const data = shOld.getRange("U2:W" + shOld.getLastRow()).getValues();
  const seen = {};
  const rows = [];
  data.forEach(function(row) {
    const kategori = String(row[0] || "").trim();
    const sub = String(row[1] || "").trim();
    const akun = String(row[2] || "").trim() || "BIAYA LAIN-LAIN";
    if (!kategori || !sub) return;
    const key = kategori + "||" + sub;
    if (seen[key]) return;
    seen[key] = true;
    rows.push([
      "KAT-" + String(rows.length + 1).padStart(4, "0"),
      kategori,
      sub,
      akun,
      "YA"
    ]);
  });

  if (rows.length) {
    masterWriteRows_(shNew, 2, rows, 5);
  }
}

function ensureMasterDataReady_(ss) {
  migrateLegacyMasterCustomers_(ss);
  migrateLegacyMasterProduk_(ss);
  migrateLegacyMasterKasBank_(ss);
  migrateLegacyMasterSuppliers_(ss);
  migrateLegacyMasterKategoriPembelian_(ss);
  ensureSumberDanaSheets_(ss);
}

function readMasterCustomers_(ss, activeOnly) {
  ensureMasterDataReady_(ss);
  const sh = ensureMasterCustomerSheet_(ss);
  const data = masterReadDataRange_(sh, 6);
  const out = [];
  data.forEach(function(row) {
    if (activeOnly && !masterIsActive_(row[5])) return;
    const nama = String(row[1] || "").trim();
    if (!nama) return;
    out.push({
      id: String(row[0] || "").trim(),
      nama: nama,
      telepon: String(row[2] || "").trim(),
      email: String(row[3] || "").trim(),
      alamat: String(row[4] || "").trim(),
      aktif: masterIsActive_(row[5])
    });
  });
  return out;
}

function readMasterProduk_(ss, activeOnly) {
  ensureMasterDataReady_(ss);
  const sh = ensureMasterProdukSheet_(ss);
  const data = masterReadDataRange_(sh, 7);
  const out = [];
  data.forEach(function(row) {
    if (activeOnly && !masterIsActive_(row[6])) return;
    const nama = String(row[2] || "").trim();
    if (!nama) return;
    out.push({
      id: String(row[0] || "").trim(),
      kode: String(row[1] || "").trim(),
      nama: nama,
      satuan: String(row[3] || "").trim(),
      harga: Number(row[4]) || 0,
      akun: String(row[5] || "PENDAPATAN").trim() || "PENDAPATAN",
      aktif: masterIsActive_(row[6])
    });
  });
  return out;
}

function readMasterKasBank_(ss, activeOnly) {
  ensureMasterDataReady_(ss);
  const sh = ensureMasterKasBankSheet_(ss);
  const data = masterReadDataRange_(sh, 5);
  const out = [];
  data.forEach(function(row) {
    if (activeOnly && !masterIsActive_(row[4])) return;
    const nama = String(row[2] || "").trim();
    if (!nama) return;
    out.push({
      id: String(row[0] || "").trim(),
      kode: String(row[1] || "").trim(),
      nama: nama,
      akunCoa: String(row[3] || nama).trim() || nama,
      aktif: masterIsActive_(row[4])
    });
  });
  return out;
}

function readMasterSuppliers_(ss, activeOnly) {
  ensureMasterDataReady_(ss);
  const sh = ensureMasterSupplierSheet_(ss);
  const data = masterReadDataRange_(sh, 6);
  const out = [];
  data.forEach(function(row) {
    if (activeOnly && !masterIsActive_(row[5])) return;
    const nama = String(row[1] || "").trim();
    if (!nama) return;
    out.push({
      id: String(row[0] || "").trim(),
      nama: nama,
      telepon: String(row[2] || "").trim(),
      email: String(row[3] || "").trim(),
      alamat: String(row[4] || "").trim(),
      aktif: masterIsActive_(row[5])
    });
  });
  return out;
}

function readMasterKategoriPembelian_(ss, activeOnly) {
  ensureMasterDataReady_(ss);
  const sh = ensureMasterKategoriPembelianSheet_(ss);
  const data = masterReadDataRange_(sh, 5);
  const out = [];
  data.forEach(function(row) {
    if (activeOnly && !masterIsActive_(row[4])) return;
    const kategori = String(row[1] || "").trim();
    const subKategori = String(row[2] || "").trim();
    if (!kategori || !subKategori) return;
    out.push({
      id: String(row[0] || "").trim(),
      kategori: kategori,
      subKategori: subKategori,
      akun: String(row[3] || "BIAYA LAIN-LAIN").trim() || "BIAYA LAIN-LAIN",
      aktif: masterIsActive_(row[4])
    });
  });
  return out.sort(function(a, b) {
    const c = a.kategori.localeCompare(b.kategori, "id");
    return c !== 0 ? c : a.subKategori.localeCompare(b.subKategori, "id");
  });
}

function buildMasterPembelianMap_(ss) {
  const map = {};
  readMasterKategoriPembelian_(ss, true).forEach(function(row) {
    if (!map[row.kategori]) map[row.kategori] = {};
    map[row.kategori][row.subKategori] = row.akun;
  });
  return map;
}

function findMasterKategoriByKeys_(ss, kategori, subKategori, excludeId) {
  const kat = String(kategori || "").trim();
  const sub = String(subKategori || "").trim();
  const exclude = String(excludeId || "").trim();
  const list = readMasterKategoriPembelian_(ss, false);
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (exclude && row.id === exclude) continue;
    if (row.kategori === kat && row.subKategori === sub) return row;
  }
  return null;
}

function findMasterRowById_(sh, id, colCount) {
  if (!sh || sh.getLastRow() < 2) return 0;
  const target = String(id || "").trim();
  if (!target) return 0;
  const data = masterReadDataRange_(sh, 1);
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === target) return i + 2;
  }
  return 0;
}

function listMasterCustomers(includeInactive) {
  authGuard_();
  const key = includeInactive ? "customers_all" : "customers_active";
  try {
    return masterListCached_(key, function() {
      const ss = getDatabaseSpreadsheet_();
      return readMasterCustomers_(ss, !includeInactive);
    });
  } catch (e) {
    throw new Error("Gagal memuat customer: " + (e.message || e));
  }
}

function listMasterProduk(includeInactive) {
  authGuard_();
  const key = includeInactive ? "produk_all" : "produk_active";
  try {
    return masterListCached_(key, function() {
      const ss = getDatabaseSpreadsheet_();
      return readMasterProduk_(ss, !includeInactive);
    });
  } catch (e) {
    throw new Error("Gagal memuat produk: " + (e.message || e));
  }
}

function listMasterKasBank(includeInactive) {
  authGuard_();
  const key = includeInactive ? "kasbank_all" : "kasbank_active";
  try {
    return masterListCached_(key, function() {
      const ss = getDatabaseSpreadsheet_();
      return readMasterKasBank_(ss, !includeInactive);
    });
  } catch (e) {
    throw new Error("Gagal memuat kas/bank: " + (e.message || e));
  }
}

function listMasterSuppliers(includeInactive) {
  authGuard_();
  const key = includeInactive ? "supplier_all" : "supplier_active";
  try {
    return masterListCached_(key, function() {
      const ss = getDatabaseSpreadsheet_();
      return readMasterSuppliers_(ss, !includeInactive);
    });
  } catch (e) {
    throw new Error("Gagal memuat supplier: " + (e.message || e));
  }
}

function listMasterKategoriPembelian(includeInactive) {
  authGuard_();
  const key = includeInactive ? "kategori_all" : "kategori_active";
  try {
    return masterListCached_(key, function() {
      const ss = getDatabaseSpreadsheet_();
      return readMasterKategoriPembelian_(ss, !includeInactive);
    });
  } catch (e) {
    throw new Error("Gagal memuat kategori pembelian: " + (e.message || e));
  }
}

function saveMasterCustomer(payload) {
  assertMasterEntityRole_("customer");
  const nama = normalizeRecordText_(payload.nama);
  if (!nama) throw new Error("Nama customer wajib diisi.");

  const ss = getDatabaseSpreadsheet_();
  ensureMasterDataReady_(ss);
  const sh = ensureMasterCustomerSheet_(ss);
  const aktif = payload.aktif === false ? "TIDAK" : "YA";
  const row = [
    String(payload.id || "").trim(),
    nama,
    String(payload.telepon || "").trim(),
    String(payload.email || "").trim().toLowerCase(),
    normalizeRecordText_(payload.alamat),
    aktif
  ];

  let rowNum = findMasterRowById_(sh, row[0], 6);
  if (rowNum > 0) {
    masterWriteRow_(sh, rowNum, row, 6);
  } else {
    row[0] = masterNextId_("CUST", sh);
    sh.appendRow(row);
  }
  invalidateMasterDataCache_();
  return { success: true, id: row[0] };
}

function saveMasterProduk(payload) {
  assertMasterEntityRole_("produk");
  const nama = normalizeRecordText_(payload.nama);
  if (!nama) throw new Error("Nama produk wajib diisi.");
  const harga = Number(payload.harga);
  if (isNaN(harga) || harga < 0) throw new Error("Harga tidak valid.");

  const ss = getDatabaseSpreadsheet_();
  ensureMasterDataReady_(ss);
  const sh = ensureMasterProdukSheet_(ss);
  const aktif = payload.aktif === false ? "TIDAK" : "YA";
  const row = [
    String(payload.id || "").trim(),
    normalizeRecordText_(payload.kode),
    nama,
    normalizeRecordText_(payload.satuan),
    harga,
    normalizeRecordText_(payload.akun || "PENDAPATAN") || "PENDAPATAN",
    aktif
  ];

  let rowNum = findMasterRowById_(sh, row[0], 7);
  if (rowNum > 0) {
    masterWriteRow_(sh, rowNum, row, 7);
  } else {
    row[0] = masterNextId_("PRD", sh);
    sh.appendRow(row);
  }
  invalidateMasterDataCache_();
  return { success: true, id: row[0] };
}

function saveMasterKasBank(payload) {
  assertMasterEntityRole_("kasBank");
  const nama = normalizeRecordText_(payload.nama);
  if (!nama) throw new Error("Nama rekening wajib diisi.");

  const ss = getDatabaseSpreadsheet_();
  ensureMasterDataReady_(ss);
  const sh = ensureMasterKasBankSheet_(ss);
  const aktif = payload.aktif === false ? "TIDAK" : "YA";
  const akunCoa = normalizeRecordText_(payload.akunCoa || nama) || nama;
  const row = [
    String(payload.id || "").trim(),
    normalizeRecordText_(payload.kode),
    nama,
    akunCoa,
    aktif
  ];

  let rowNum = findMasterRowById_(sh, row[0], 5);
  if (rowNum > 0) {
    masterWriteRow_(sh, rowNum, row, 5);
  } else {
    row[0] = masterNextId_("KB", sh);
    sh.appendRow(row);
  }
  invalidateMasterDataCache_();
  return { success: true, id: row[0] };
}

function saveMasterSupplier(payload) {
  assertMasterEntityRole_("supplier");
  const nama = normalizeRecordText_(payload.nama);
  if (!nama) throw new Error("Nama supplier wajib diisi.");

  const ss = getDatabaseSpreadsheet_();
  ensureMasterDataReady_(ss);
  const sh = ensureMasterSupplierSheet_(ss);
  const aktif = payload.aktif === false ? "TIDAK" : "YA";
  const row = [
    String(payload.id || "").trim(),
    nama,
    String(payload.telepon || "").trim(),
    String(payload.email || "").trim().toLowerCase(),
    normalizeRecordText_(payload.alamat),
    aktif
  ];

  let rowNum = findMasterRowById_(sh, row[0], 6);
  if (rowNum > 0) {
    masterWriteRow_(sh, rowNum, row, 6);
  } else {
    row[0] = masterNextId_("SUP", sh);
    sh.appendRow(row);
  }
  invalidateMasterDataCache_();
  return { success: true, id: row[0] };
}

function saveMasterKategoriPembelian(payload) {
  assertMasterEntityRole_("kategoriPembelian");
  const kategori = normalizeRecordText_(payload.kategori);
  const subKategori = normalizeRecordText_(payload.subKategori);
  if (!kategori) throw new Error("Kategori wajib diisi.");
  if (!subKategori) throw new Error("Sub-kategori wajib diisi.");

  const ss = getDatabaseSpreadsheet_();
  ensureMasterDataReady_(ss);
  const sh = ensureMasterKategoriPembelianSheet_(ss);
  const id = String(payload.id || "").trim();
  const dup = findMasterKategoriByKeys_(ss, kategori, subKategori, id);
  if (dup) throw new Error("Kombinasi kategori & sub-kategori sudah ada.");

  const aktif = payload.aktif === false ? "TIDAK" : "YA";
  const row = [
    id,
    kategori,
    subKategori,
    normalizeRecordText_(payload.akun || "BIAYA LAIN-LAIN") || "BIAYA LAIN-LAIN",
    aktif
  ];

  let rowNum = findMasterRowById_(sh, row[0], 5);
  if (rowNum > 0) {
    masterWriteRow_(sh, rowNum, row, 5);
  } else {
    row[0] = masterNextId_("KAT", sh);
    sh.appendRow(row);
  }
  invalidateMasterDataCache_();
  return { success: true, id: row[0] };
}

function setMasterCustomerStatus(id, aktif) {
  assertMasterEntityRole_("customer");
  const ss = getDatabaseSpreadsheet_();
  const sh = ensureMasterCustomerSheet_(ss);
  const rowNum = findMasterRowById_(sh, id, 6);
  if (!rowNum) throw new Error("Customer tidak ditemukan.");
  sh.getRange(rowNum, 6).setValue(aktif ? "YA" : "TIDAK");
  invalidateMasterDataCache_();
  return { success: true };
}

function setMasterProdukStatus(id, aktif) {
  assertMasterEntityRole_("produk");
  const ss = getDatabaseSpreadsheet_();
  const sh = ensureMasterProdukSheet_(ss);
  const rowNum = findMasterRowById_(sh, id, 7);
  if (!rowNum) throw new Error("Produk tidak ditemukan.");
  sh.getRange(rowNum, 7).setValue(aktif ? "YA" : "TIDAK");
  invalidateMasterDataCache_();
  return { success: true };
}

function setMasterKasBankStatus(id, aktif) {
  assertMasterEntityRole_("kasBank");
  const ss = getDatabaseSpreadsheet_();
  const sh = ensureMasterKasBankSheet_(ss);
  const rowNum = findMasterRowById_(sh, id, 5);
  if (!rowNum) throw new Error("Rekening tidak ditemukan.");
  sh.getRange(rowNum, 5).setValue(aktif ? "YA" : "TIDAK");
  invalidateMasterDataCache_();
  return { success: true };
}

function setMasterSupplierStatus(id, aktif) {
  assertMasterEntityRole_("supplier");
  const ss = getDatabaseSpreadsheet_();
  const sh = ensureMasterSupplierSheet_(ss);
  const rowNum = findMasterRowById_(sh, id, 6);
  if (!rowNum) throw new Error("Supplier tidak ditemukan.");
  sh.getRange(rowNum, 6).setValue(aktif ? "YA" : "TIDAK");
  invalidateMasterDataCache_();
  return { success: true };
}

function setMasterKategoriPembelianStatus(id, aktif) {
  assertMasterEntityRole_("kategoriPembelian");
  const ss = getDatabaseSpreadsheet_();
  const sh = ensureMasterKategoriPembelianSheet_(ss);
  const rowNum = findMasterRowById_(sh, id, 5);
  if (!rowNum) throw new Error("Kategori pembelian tidak ditemukan.");
  sh.getRange(rowNum, 5).setValue(aktif ? "YA" : "TIDAK");
  invalidateMasterDataCache_();
  return { success: true };
}

// ==========================================
// MASTER DATA (Fase 3: COA — backend MASTER COA)
// ==========================================

const COA_TIPE_LIST_ = ["Aset", "Kewajiban", "Ekuitas", "Pendapatan", "Beban"];

function coaGrupNeracaFromSub_(tipe, sub) {
  if (tipe === "Aset" || tipe === "Kewajiban") return sub;
  if (tipe === "Ekuitas") return "Ekuitas";
  return "";
}

function coaGrupLabaRugiFromSub_(tipe, sub) {
  if (tipe === "Pendapatan") return "Pendapatan";
  if (sub === "HPP") return "HPP";
  if (tipe === "Beban") return "Beban Operasional";
  return "";
}

function coaSaldoDefaultFromTipe_(tipe) {
  if (tipe === "Kewajiban" || tipe === "Ekuitas" || tipe === "Pendapatan") return "Kredit";
  return "Debit";
}

function coaGuessSubkelompok_(namaAkun, tipe) {
  const lower = String(namaAkun || "").trim().toLowerCase();
  if (tipe === "Aset") {
    if (/penyusutan|akumulasi|peralatan|tetap|tanah|gedung|mesin|kendaraan/.test(lower)) return "Aset Tetap";
    return "Aset Lancar";
  }
  if (tipe === "Kewajiban") {
    if (/jangka panjang|jkp|bank jangka/.test(lower)) return "Kewajiban Jangka Panjang";
    return "Kewajiban Lancar";
  }
  if (tipe === "Beban") {
    if (/hpp|pokok penjualan|harga pokok|cost of/.test(lower)) return "HPP";
    return "Beban Operasional";
  }
  if (tipe === "Pendapatan") return "Pendapatan Usaha";
  if (tipe === "Ekuitas") return "Ekuitas";
  return "";
}

function coaReadAllRows_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const numCols = Math.max(8, sh.getLastColumn());
  return sh.getRange(2, 1, lastRow - 1, numCols).getValues();
}

function ensureMasterCoaSheetReady_(ss) {
  let sh = ss.getSheetByName("MASTER COA");
  if (!sh) {
    sh = ss.insertSheet("MASTER COA");
    sh.appendRow([
      "No Akun", "Nama Akun", "Tipe", "Subkelompok", "Saldo Normal",
      "Grup Neraca", "Grup Laba Rugi", "Aktif"
    ]);
    sh.setFrozenRows(1);
    return sh;
  }

  const h8 = String(sh.getRange(1, 8).getValue() || "").trim();
  if (!h8) {
    sh.getRange(1, 8).setValue("Aktif").setFontWeight("bold");
    const lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      const n = lastRow - 1;
      const aktifCol = [];
      for (let i = 0; i < n; i++) aktifCol.push(["YA"]);
      sh.getRange(2, 8, n, 1).setValues(aktifCol);
    }
  }
  return sh;
}

function nextCoaNoForTipe_(sh, tipe) {
  const prefixMap = { Aset: 1, Kewajiban: 2, Ekuitas: 3, Pendapatan: 4, Beban: 5 };
  const head = prefixMap[tipe];
  if (!head) return "";

  const used = {};
  coaReadAllRows_(sh).forEach(function(r) {
    const no = String(r[0] || "").trim();
    if (no) used[no] = true;
  });

  for (let n = 1; n <= 999; n++) {
    const candidate = String(head) + ("00" + n).slice(-3);
    if (!used[candidate]) return candidate;
  }
  return String(head) + "999";
}

function findCoaRowByNo_(sh, no) {
  const target = String(no || "").trim();
  if (!target) return 0;
  const rows = coaReadAllRows_(sh);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === target) return i + 2;
  }
  return 0;
}

function findCoaByNama_(sh, nama, excludeNo) {
  const target = String(nama || "").trim().toLowerCase();
  const exclude = String(excludeNo || "").trim();
  if (!target) return null;
  const rows = coaReadAllRows_(sh);
  for (let i = 0; i < rows.length; i++) {
    const no = String(rows[i][0] || "").trim();
    const nm = String(rows[i][1] || "").trim().toLowerCase();
    if (exclude && no === exclude) continue;
    if (nm === target) return { rowNum: i + 2, no: no };
  }
  return null;
}

function readMasterCoa_(ss, includeInactive) {
  const sh = ensureMasterCoaSheetReady_(ss);
  const out = [];
  coaReadAllRows_(sh).forEach(function(row) {
    const aktifVal = row.length >= 8 ? row[7] : "YA";
    if (!includeInactive && !masterIsActive_(aktifVal)) return;
    const nama = String(row[1] || "").trim();
    if (!nama) return;
    const tipe = String(row[2] || "").trim();
    let sub = String(row[3] || "").trim();
    let saldo = String(row[4] || "").trim();
    if (!sub) sub = coaGuessSubkelompok_(nama, tipe);
    if (!saldo) saldo = coaSaldoDefaultFromTipe_(tipe);
    out.push({
      id: String(row[0] || "").trim(),
      no: String(row[0] || "").trim(),
      nama: nama,
      tipe: tipe,
      sub: sub,
      saldoNormal: saldo,
      grupNeraca: String(row[5] || coaGrupNeracaFromSub_(tipe, sub)).trim(),
      grupLabaRugi: String(row[6] || coaGrupLabaRugiFromSub_(tipe, sub)).trim(),
      aktif: masterIsActive_(aktifVal)
    });
  });
  return out.sort(function(a, b) {
    return String(a.no).localeCompare(String(b.no), "id", { numeric: true });
  });
}

function listMasterCoa(includeInactive) {
  authGuard_();
  const key = includeInactive ? "coa_all" : "coa_active";
  try {
    return masterListCached_(key, function() {
      const ss = openBackendSpreadsheet_();
      return readMasterCoa_(ss, !!includeInactive);
    });
  } catch (e) {
    throw new Error("Gagal memuat COA: " + (e.message || e));
  }
}

function saveMasterCoa(payload) {
  assertMasterEntityRole_("coa");
  const nama = normalizeRecordText_(payload.nama);
  const tipe = String(payload.tipe || "").trim();
  if (!nama) throw new Error("Nama akun wajib diisi.");
  if (!tipe) throw new Error("Tipe akun wajib dipilih.");
  if (COA_TIPE_LIST_.indexOf(tipe) < 0) throw new Error("Tipe akun tidak valid.");

  const ss = openBackendSpreadsheet_();
  const sh = ensureMasterCoaSheetReady_(ss);
  let no = String(payload.no || payload.id || "").trim();
  const dup = findCoaByNama_(sh, nama, no);
  if (dup) throw new Error("Nama akun \"" + nama + "\" sudah dipakai (No " + dup.no + ").");

  let sub = normalizeRecordText_(payload.sub);
  if (!sub) sub = coaGuessSubkelompok_(nama, tipe);
  let saldo = String(payload.saldoNormal || "").trim();
  if (saldo !== "Debit" && saldo !== "Kredit") saldo = coaSaldoDefaultFromTipe_(tipe);
  const aktif = payload.aktif === false ? "TIDAK" : "YA";

  let rowNum = no ? findCoaRowByNo_(sh, no) : 0;
  if (!no || !rowNum) {
    no = nextCoaNoForTipe_(sh, tipe);
    rowNum = 0;
  }

  const row = [
    no,
    nama,
    tipe,
    sub,
    saldo,
    coaGrupNeracaFromSub_(tipe, sub),
    coaGrupLabaRugiFromSub_(tipe, sub),
    aktif
  ];

  if (rowNum > 0) {
    masterWriteRow_(sh, rowNum, row, 8);
  } else {
    sh.appendRow(row);
  }

  const sync = syncBackendLaporanFromCoa_();
  invalidateMasterDataCache_();
  dashClearKeuanganCache_();
  return { success: true, id: no, syncOk: !!(sync && sync.ok) };
}

function setMasterCoaStatus(id, aktif) {
  assertMasterEntityRole_("coa");
  const ss = openBackendSpreadsheet_();
  const sh = ensureMasterCoaSheetReady_(ss);
  const rowNum = findCoaRowByNo_(sh, id);
  if (!rowNum) throw new Error("Akun COA tidak ditemukan.");
  sh.getRange(rowNum, 8).setValue(aktif ? "YA" : "TIDAK");
  const sync = syncBackendLaporanFromCoa_();
  invalidateMasterDataCache_();
  dashClearKeuanganCache_();
  return { success: true, syncOk: !!(sync && sync.ok) };
}

function syncMasterCoaLaporan() {
  assertMasterEntityRole_("coa");
  const sync = syncBackendLaporanFromCoa_();
  if (!sync || !sync.ok) {
    const detail = sync && (sync.message || sync.error) ? String(sync.message || sync.error) : "";
    throw new Error(detail || "Sinkron laporan backend gagal.");
  }
  return sync;
}

function syncBackendLaporanDirect_(ss) {
  try {
    if (typeof BackendEngine !== "undefined" && BackendEngine.clientSyncLaporanFromCoa) {
      return BackendEngine.clientSyncLaporanFromCoa(ss, true);
    }
  } catch (e) {
    Logger.log("syncBackendLaporanDirect_: " + (e.message || e));
    return { ok: false, error: String(e.message || e) };
  }
  return null;
}

function syncBackendLaporanViaApi_() {
  const payload = {
    apiKey: getBackendApiKey_(),
    spreadsheetId: DATABASE_ID,
    action: "SYNC_LAPORAN"
  };
  const response = UrlFetchApp.fetch(getBackendWebappUrl_(), {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    followRedirects: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText() || "";
  let body = {};
  try {
    body = JSON.parse(text);
  } catch (parseErr) {
    if (text.indexOf("<!DOCTYPE") >= 0 || text.indexOf("<html") >= 0) {
      return {
        ok: false,
        error: "URL Web App backend tidak valid. Update BACKEND_WEBAPP_URL di SETTING lalu redeploy backend."
      };
    }
    return { ok: false, error: "Respons backend tidak valid (HTTP " + code + ")." };
  }

  if (code >= 200 && code < 300 && body.success) {
    return body.sync || { ok: true };
  }

  let err = "HTTP " + code;
  if (body.message) err = body.message;
  if (body.sync && body.sync.message) err = body.sync.message;
  if (body.sync && body.sync.error) err = body.sync.error;
  return { ok: false, error: err };
}

function getCustomers() {
  authGuard_();
  return masterListCached_("customers_names", function() {
    const ss = getDatabaseSpreadsheet_();
    return readMasterCustomers_(ss, true).map(function(c) { return c.nama; });
  });
}

function getProducts() {
  authGuard_();
  return masterListCached_("products_dto", function() {
    const ss = getDatabaseSpreadsheet_();
    return readMasterProduk_(ss, true).map(function(p) {
      return { kode: p.kode, nama: p.nama, harga: p.harga, akun: p.akun };
    });
  });
}

function getListKasBank() {
  authGuard_();
  return masterListCached_("kasbank_dto", function() {
    const ss = getDatabaseSpreadsheet_();
    return readMasterKasBank_(ss, true).map(function(k) {
      return { kode: k.kode, nama: k.nama };
    });
  });
}
