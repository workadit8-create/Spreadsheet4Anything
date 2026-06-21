// Validasi transaksi, doGet, helper umum
// ==========================================
// CACHE SPREADSHEET (per eksekusi server — kurangi openById berulang)
// ==========================================

let SS_DATABASE_ = null;
let SETTINGS_CACHE_ = null;
let SETTINGS_ROW_MAP_ = null;

function getDatabaseSpreadsheet_() {
  if (!SS_DATABASE_) {
    SS_DATABASE_ = SpreadsheetApp.openById(DATABASE_ID);
  }
  return SS_DATABASE_;
}

function loadSettingsCache_() {
  if (SETTINGS_CACHE_) return SETTINGS_CACHE_;
  SETTINGS_CACHE_ = {};
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("SETTING");
  if (!sh) return SETTINGS_CACHE_;
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const k = String(data[i][0] || "").trim();
    if (k) SETTINGS_CACHE_[k] = data[i][1];
  }
  return SETTINGS_CACHE_;
}

function invalidateSettingsCache_() {
  SETTINGS_CACHE_ = null;
  SETTINGS_ROW_MAP_ = null;
}

/** Folder upload per client — dari SETTING UPLOAD_FOLDER_ID, fallback legacy Client 1. */
function getUploadFolder_() {
  const legacyId = "1fQSokPZUT_FdqNwXunH8s_0b5ZcrAC7E";
  const fromSetting = String(getSettingValue_("UPLOAD_FOLDER_ID") || "").trim();
  const folderId = fromSetting || legacyId;
  return DriveApp.getFolderById(folderId);
}

function loadSettingsRowMap_(sh) {
  if (SETTINGS_ROW_MAP_) return SETTINGS_ROW_MAP_;
  SETTINGS_ROW_MAP_ = {};
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const k = String(data[i][0] || "").trim();
    if (k) SETTINGS_ROW_MAP_[k] = i + 1;
  }
  return SETTINGS_ROW_MAP_;
}

/** Tulis banyak baris ke sheet dalam satu operasi (lebih cepat dari appendRow berulang). */
function writeSheetRows_(sh, rows) {
  if (!sh || !rows || !rows.length) return;
  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

// Counter nomor dokumen — PropertiesService (jauh lebih cepat dari tulis sheet SETTING tiap save)
const SEQ_PROP_KEYS_ = [
  "INVOICE_SEQ_DATE", "INVOICE_SEQ_NUM", "TRANSACTION_SEQ",
  "QT_SEQ_DATE", "QT_SEQ_NUM", "QT_LINE_SEQ",
  "PR_SEQ_DATE", "PR_SEQ_NUM",
  "JM_SEQ_DATE", "JM_SEQ_NUM"
];

let SEQ_PROPS_READY_ = false;

function scriptProps_() {
  return PropertiesService.getScriptProperties();
}

function ensureSeqPropsFromSetting_() {
  if (SEQ_PROPS_READY_) return;
  SEQ_PROPS_READY_ = true;
  const props = scriptProps_();
  if (props.getProperty("TRANSACTION_SEQ")) return;
  try {
    loadSettingsCache_();
    const batch = {};
    SEQ_PROP_KEYS_.forEach(function(k) {
      const v = getSettingValue_(k);
      if (v !== null && v !== undefined && String(v) !== "") batch[k] = String(v);
    });
    if (Object.keys(batch).length) props.setProperties(batch);
  } catch (ignore) {}
}

function getSeqProp_(key) {
  ensureSeqPropsFromSetting_();
  return scriptProps_().getProperty(key);
}

function setSeqProps_(map) {
  ensureSeqPropsFromSetting_();
  const batch = {};
  Object.keys(map).forEach(function(k) {
    batch[k] = String(map[k]);
  });
  scriptProps_().setProperties(batch);
  Object.keys(map).forEach(function(k) {
    if (!SETTINGS_CACHE_) loadSettingsCache_();
    SETTINGS_CACHE_[k] = map[k];
  });
}

/** Salin counter ke sheet SETTING (backup) — panggil saat warm-up, bukan tiap save. */
function syncSeqPropsToSetting_() {
  ensureSeqPropsFromSetting_();
  const props = scriptProps_();
  const pairs = [];
  SEQ_PROP_KEYS_.forEach(function(k) {
    const v = props.getProperty(k);
    if (v !== null && v !== undefined) pairs.push([k, v]);
  });
  if (pairs.length) setSettingValues_(pairs);
}

function acquireSaveLock_(label) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error("Sistem sibuk (" + (label || "simpan") + "). Coba lagi dalam beberapa detik.");
  }
  return lock;
}

/** Baca satu kolom sheet (tanpa getDataRange penuh). */
function readSheetColumnValues_(sh, col, startRow) {
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  const from = startRow || 2;
  if (lastRow < from) return [];
  return sh.getRange(from, col, lastRow - from + 1, 1).getValues();
}

// ==========================================
// VALIDASI & HELPER INTERNAL
// ==========================================

/** Normalisasi teks operasional — trim + huruf besar (pencatatan konsisten). */
function normalizeRecordText_(val) {
  if (val == null) return "";
  return String(val).trim().toUpperCase();
}

function validateInvoiceData_(invoiceData) {
  if (!invoiceData.tanggal) {
    throw new Error("Tanggal invoice wajib diisi.");
  }
  invoiceData.customer = normalizeRecordText_(invoiceData.customer);
  if (!invoiceData.customer) {
    throw new Error("Customer wajib dipilih.");
  }
  if (invoiceData.keterangan) {
    invoiceData.keterangan = normalizeRecordText_(invoiceData.keterangan);
  }
  if (!invoiceData.products || invoiceData.products.length === 0) {
    throw new Error("Minimal harus ada 1 produk.");
  }

  let grandTotal = 0;
  invoiceData.products.forEach(function(item, idx) {
    const baris = idx + 1;
    if (item.produk) item.produk = normalizeRecordText_(item.produk);
    if (!item.produk) {
      throw new Error("Produk baris " + baris + " wajib dipilih.");
    }
    const qty = Number(item.qty);
    if (!qty || qty <= 0) {
      throw new Error("Qty baris " + baris + " harus lebih dari 0.");
    }
    const harga = Number(item.harga);
    if (isNaN(harga) || harga < 0) {
      throw new Error("Harga baris " + baris + " tidak valid.");
    }
    const diskon = Number(item.diskon) || 0;
    if (diskon < 0) {
      throw new Error("Diskon baris " + baris + " tidak boleh negatif.");
    }
    const totalBaris = qty * harga - diskon;
    if (totalBaris < 0) {
      throw new Error("Total baris " + baris + " tidak valid.");
    }
    grandTotal += totalBaris;
  });

  const bayar = Number(invoiceData.bayar) || 0;
  if (bayar < 0) {
    throw new Error("Nominal bayar tidak boleh negatif.");
  }
  if (bayar > grandTotal) {
    throw new Error("Nominal bayar tidak boleh melebihi total invoice.");
  }
  if (bayar > 0 && (!invoiceData.rekening || !String(invoiceData.rekening).trim())) {
    throw new Error("Rekening tujuan wajib dipilih jika ada pembayaran.");
  }

  invoiceData.bayar = bayar;
  return grandTotal;
}

function validatePelunasanPayload_(payload, sisaPiutang) {
  if (!payload.tanggal) {
    throw new Error("Tanggal bayar wajib diisi.");
  }
  if (!payload.invoice || !String(payload.invoice).trim()) {
    throw new Error("Nomor invoice wajib.");
  }
  const nominal = Number(payload.nominal);
  if (!nominal || nominal <= 0) {
    throw new Error("Nominal bayar harus lebih dari 0.");
  }
  if (nominal > sisaPiutang) {
    throw new Error("Nominal bayar tidak boleh melebihi sisa piutang.");
  }
  if (!payload.rekening || !String(payload.rekening).trim()) {
    throw new Error("Rekening tujuan wajib dipilih.");
  }
  if (payload.keterangan) payload.keterangan = normalizeRecordText_(payload.keterangan);
  payload.nominal = nominal;
}

function validatePelunasanHutangPayload_(payload, sisaHutang) {
  if (!payload.tanggal) {
    throw new Error("Tanggal bayar wajib diisi.");
  }
  if (!payload.po || !String(payload.po).trim()) {
    throw new Error("Nomor PO wajib.");
  }
  const nominal = Number(payload.nominal);
  if (!nominal || nominal <= 0) {
    throw new Error("Nominal bayar harus lebih dari 0.");
  }
  if (nominal > sisaHutang) {
    throw new Error("Nominal bayar tidak boleh melebihi sisa hutang.");
  }
  if (!payload.sdAlokasi || !payload.sdAlokasi.length) {
    throw new Error("Alokasi Sumber Dana wajib diisi.");
  }
  if (payload.keterangan) payload.keterangan = normalizeRecordText_(payload.keterangan);
  payload.nominal = nominal;
}

function validateMutasiDana_(p) {
  if (!p.tanggal) {
    throw new Error("Tanggal mutasi wajib diisi.");
  }
  if (p.keterangan) p.keterangan = normalizeRecordText_(p.keterangan);
  if (p.sdUntukPembelian) p.sdUntukPembelian = normalizeRecordText_(p.sdUntukPembelian);
  if (p.sdPetugas) p.sdPetugas = normalizeRecordText_(p.sdPetugas);
  if (p.sumber) p.sumber = normalizeRecordText_(p.sumber);
  if (p.tujuan) p.tujuan = normalizeRecordText_(p.tujuan);
  const nominal = Number(p.nominal);
  if (!nominal || nominal <= 0) {
    throw new Error("Nominal mutasi harus lebih dari 0.");
  }
  p.nominal = nominal;

  const jenis = String(p.jenis || "").trim();
  if (jenis === "Transfer") {
    if (!p.sumber || !String(p.sumber).trim()) {
      throw new Error("Rekening sumber wajib dipilih.");
    }
    if (!p.tujuan || !String(p.tujuan).trim()) {
      throw new Error("Rekening tujuan wajib dipilih.");
    }
    if (p.sumber === p.tujuan) {
      throw new Error("Rekening sumber dan tujuan tidak boleh sama.");
    }
    if (p.buatSumberDana === true) {
      if (!p.sdUntukPembelian || !String(p.sdUntukPembelian).trim()) {
        throw new Error("Untuk pembelian wajib diisi saat membuat Sumber Dana.");
      }
      if (!p.sdPetugas || !String(p.sdPetugas).trim()) {
        throw new Error("Petugas wajib diisi saat membuat Sumber Dana.");
      }
    }
  } else if (jenis === "Masuk") {
    if (!p.tujuan || !String(p.tujuan).trim()) {
      throw new Error("Rekening tujuan wajib dipilih untuk setoran.");
    }
  } else if (jenis === "Keluar") {
    if (!p.sumber || !String(p.sumber).trim()) {
      throw new Error("Rekening sumber wajib dipilih untuk penarikan.");
    }
  }
}

function validatePembelian_(p) {
  if (!p.tanggal) {
    throw new Error("Tanggal pembelian wajib diisi.");
  }
  p.supplier = normalizeRecordText_(p.supplier);
  if (!p.supplier) {
    throw new Error("Nama supplier wajib diisi.");
  }
  if (p.keterangan) p.keterangan = normalizeRecordText_(p.keterangan);
  if (!p.items || p.items.length === 0) {
    throw new Error("Minimal harus ada 1 barang.");
  }

  let grandTotal = 0;
  p.items.forEach(function(item, idx) {
    const baris = idx + 1;
    if (item.kategori) item.kategori = normalizeRecordText_(item.kategori);
    if (item.subKategori) item.subKategori = normalizeRecordText_(item.subKategori);
    if (item.namaBrg) item.namaBrg = normalizeRecordText_(item.namaBrg);
    if (item.akun) item.akun = normalizeRecordText_(item.akun);
    if (!item.kategori) {
      throw new Error("Kategori baris " + baris + " wajib dipilih.");
    }
    if (!item.subKategori) {
      throw new Error("Sub-kategori baris " + baris + " wajib dipilih.");
    }
    if (!item.namaBrg) {
      throw new Error("Nama barang baris " + baris + " wajib diisi.");
    }
    const qty = Number(item.qty);
    if (!qty || qty <= 0) {
      throw new Error("Qty baris " + baris + " harus lebih dari 0.");
    }
    const harga = Number(item.harga);
    if (isNaN(harga) || harga < 0) {
      throw new Error("Harga baris " + baris + " tidak valid.");
    }
    const diskon = Number(item.diskon) || 0;
    grandTotal += qty * harga - diskon;
  });

  if (grandTotal < 0) {
    throw new Error("Total pembelian tidak valid.");
  }

  const bayar = Number(p.bayar) || 0;
  if (bayar < 0) {
    throw new Error("Nominal bayar tidak boleh negatif.");
  }
  if (bayar > grandTotal) {
    throw new Error("Nominal bayar tidak boleh melebihi total pembelian.");
  }
  if (bayar > 0) {
    if (!p.sdAlokasi || !p.sdAlokasi.length) {
      throw new Error("Alokasi Sumber Dana wajib jika ada pembayaran.");
    }
  }
  p.bayar = bayar;
}

function deleteInvoiceRows_(sh, invoiceNo) {
  const data = sh.getDataRange().getValues();
  const target = String(invoiceNo).trim();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][4] || "").trim() === target) {
      sh.deleteRow(i + 1);
    }
  }
}

function removeMutasiByInvoicePayment_(ss, invoiceNo) {
  const shMutasi = ss.getSheetByName("MUTASI_DANA");
  if (!shMutasi) return;
  const data = shMutasi.getDataRange().getValues();
  const ketTarget = "Pembayaran " + String(invoiceNo).trim();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][6] || "").trim() === ketTarget) {
      shMutasi.deleteRow(i + 1);
    }
  }
}

function isInvoicePosted_(ss, invoiceNo) {
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();
  const target = String(invoiceNo).trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][4] || "").trim() === target && data[i][16] === true) {
      return true;
    }
  }
  return false;
}

function getSisaPiutangInvoice_(ss, invoiceNo) {
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();
  const target = String(invoiceNo).trim();
  let sisa = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][4] || "").trim() === target) {
      sisa += Number(data[i][13]) || 0;
    }
  }
  return sisa;
}

function getTotalPelunasanInvoice_(ss, invoiceNo) {
  const sh = ss.getSheetByName("PELUNASAN_PIUTANG");
  if (!sh) return 0;
  const data = sh.getDataRange().getValues();
  const target = String(invoiceNo).trim();
  let total = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || "").trim() === target) {
      total += Number(data[i][3]) || 0;
    }
  }
  return total;
}
