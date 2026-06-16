// Posting jurnal ke backend
// ==========================================
// MODUL POSTING JURNAL (FRONTEND)
// ==========================================

const POSTING_MODUL_META_ = {
  PEMASUKAN: { label: "Pemasukan (Penjualan)", sheet: "PEMASUKAN" },
  PEMBELIAN: { label: "Pembelian", sheet: "PEMBELIAN" },
  PELUNASAN_PIUTANG: { label: "Pelunasan Piutang", sheet: "PELUNASAN_PIUTANG" },
  PELUNASAN_UTANG: { label: "Pelunasan Hutang", sheet: "PELUNASAN_UTANG" },
  JURNAL_MANUAL: { label: "Jurnal Manual", sheet: "JURNAL_MANUAL" },
  MUTASI_DANA: { label: "Mutasi Kas/Bank", sheet: "MUTASI_DANA" }
};

function getPostingModulList() {
  authGuard_();
  return Object.keys(POSTING_MODUL_META_).map(function(key) {
    return { id: key, label: POSTING_MODUL_META_[key].label };
  });
}

function postIsPosted_(val) {
  return val === true || String(val).toUpperCase() === "TRUE";
}

function postInDateRange_(dateVal, startDate, endDate) {
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const start = startDate ? new Date(startDate + "T00:00:00") : null;
  const end = endDate ? new Date(endDate + "T23:59:59") : null;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function postFmtDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}

function postCallBackend_(payload) {
  const body = Object.assign({
    apiKey: getBackendApiKey_(),
    spreadsheetId: DATABASE_ID
  }, payload);
  const response = UrlFetchApp.fetch(getBackendWebappUrl_(), {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  let hasil = {};
  try {
    hasil = JSON.parse(response.getContentText() || "{}");
  } catch (e) {
    throw new Error("Respons backend tidak valid (HTTP " + code + ")");
  }
  if (code < 200 || code >= 300 || !hasil.success) {
    throw new Error(hasil.message || ("Posting gagal (HTTP " + code + ")"));
  }
  return hasil;
}

function getUnpostedTransactions(modul, startDate, endDate) {
  authGuard_();
  const key = String(modul || "").trim().toUpperCase();
  if (!POSTING_MODUL_META_[key]) {
    throw new Error("Modul posting tidak valid.");
  }
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  if (key === "PEMASUKAN") return postListPemasukan_(ss, startDate, endDate);
  if (key === "PEMBELIAN") return postListPembelian_(ss, startDate, endDate);
  if (key === "PELUNASAN_PIUTANG") return postListPelunasanPiutang_(ss, startDate, endDate);
  if (key === "PELUNASAN_UTANG") return postListPelunasanUtang_(ss, startDate, endDate);
  if (key === "JURNAL_MANUAL") return postListJurnalManual_(ss, startDate, endDate);
  if (key === "MUTASI_DANA") return postListMutasiDana_(ss, startDate, endDate);
  return [];
}

function postListPemasukan_(ss, startDate, endDate) {
  const sh = ss.getSheetByName("PEMASUKAN");
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 22).getValues();
  const groups = {};

  data.forEach(function(row) {
    const invoice = String(row[4] || "").trim();
    if (!invoice) return;
    if (postIsPosted_(row[16])) return;
    if (String(row[19] || "").trim() !== "POST") return;
    if ((Number(row[11]) || 0) <= 0) return;
    if (!String(row[18] || "").trim()) return;
    if (!postInDateRange_(row[1], startDate, endDate)) return;

    const d = row[1] instanceof Date ? row[1] : new Date(row[1]);
    if (!groups[invoice]) {
      groups[invoice] = {
        id: "PEMASUKAN::" + invoice,
        modul: "PEMASUKAN",
        ref: invoice,
        tanggal: postFmtDate_(d),
        tanggalRaw: d.getTime(),
        deskripsi: String(row[5] || "").trim(),
        nominal: 0,
        lineCount: 0
      };
    }
    groups[invoice].nominal += Number(row[11]) || 0;
    groups[invoice].lineCount += 1;
  });

  return Object.keys(groups).map(function(k) { return groups[k]; })
    .sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
}

function postListPembelian_(ss, startDate, endDate) {
  const sh = ss.getSheetByName("PEMBELIAN");
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 18).getValues();
  const groups = {};

  data.forEach(function(row) {
    const po = String(row[1] || "").trim();
    if (!po) return;
    if (postIsPosted_(row[11])) return;
    if (String(row[16] || "").trim() !== "POST") return;
    if ((Number(row[7]) || 0) <= 0) return;
    if (!String(row[15] || "").trim()) return;
    if (!postInDateRange_(row[0], startDate, endDate)) return;

    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (!groups[po]) {
      groups[po] = {
        id: "PEMBELIAN::" + po,
        modul: "PEMBELIAN",
        ref: po,
        tanggal: postFmtDate_(d),
        tanggalRaw: d.getTime(),
        deskripsi: String(row[2] || "").trim(),
        nominal: 0,
        lineCount: 0
      };
    }
    groups[po].nominal += Number(row[7]) || 0;
    groups[po].lineCount += 1;
  });

  return Object.keys(groups).map(function(k) { return groups[k]; })
    .sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
}

function postListPelunasanPiutang_(ss, startDate, endDate) {
  const sh = ss.getSheetByName("PELUNASAN_PIUTANG");
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  const items = [];

  data.forEach(function(row) {
    if (postIsPosted_(row[6])) return;
    if (String(row[8] || "").trim() !== "POST") return;
    if ((Number(row[3]) || 0) <= 0) return;
    if (!String(row[7] || "").trim()) return;
    if (!postInDateRange_(row[0], startDate, endDate)) return;
    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    const txId = String(row[7] || "").trim();
    items.push({
      id: "PELUNASAN_PIUTANG::" + txId,
      modul: "PELUNASAN_PIUTANG",
      ref: String(row[1] || "").trim(),
      transactionId: txId,
      tanggal: postFmtDate_(d),
      tanggalRaw: d.getTime(),
      deskripsi: String(row[2] || "").trim() + " — " + String(row[5] || "").trim(),
      nominal: Number(row[3]) || 0,
      lineCount: 1
    });
  });

  return items.sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
}

function postListPelunasanUtang_(ss, startDate, endDate) {
  const sh = ss.getSheetByName("PELUNASAN_UTANG");
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  const items = [];

  data.forEach(function(row) {
    if (postIsPosted_(row[6])) return;
    if (String(row[8] || "").trim() !== "POST") return;
    if ((Number(row[3]) || 0) <= 0) return;
    if (!String(row[7] || "").trim()) return;
    if (!postInDateRange_(row[0], startDate, endDate)) return;
    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    const txId = String(row[7] || "").trim();
    items.push({
      id: "PELUNASAN_UTANG::" + txId,
      modul: "PELUNASAN_UTANG",
      ref: String(row[1] || "").trim(),
      transactionId: txId,
      tanggal: postFmtDate_(d),
      tanggalRaw: d.getTime(),
      deskripsi: String(row[2] || "").trim() + " — " + String(row[5] || "").trim(),
      nominal: Number(row[3]) || 0,
      lineCount: 1
    });
  });

  return items.sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
}

function postListJurnalManual_(ss, startDate, endDate) {
  const sh = ss.getSheetByName("JURNAL_MANUAL");
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues();
  const groups = {};

  data.forEach(function(row) {
    const noBukti = String(row[1] || "").trim();
    if (!noBukti) return;
    if (postIsPosted_(row[6])) return;
    if (String(row[8] || "").trim() !== "POST") return;
    if (!String(row[7] || "").trim()) return;
    if (!postInDateRange_(row[0], startDate, endDate)) return;

    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (!groups[noBukti]) {
      groups[noBukti] = {
        id: "JURNAL_MANUAL::" + noBukti,
        modul: "JURNAL_MANUAL",
        ref: noBukti,
        transactionId: String(row[7] || "").trim(),
        tanggal: postFmtDate_(d),
        tanggalRaw: d.getTime(),
        deskripsi: String(row[5] || "").trim() || "Jurnal manual",
        nominal: 0,
        lineCount: 0
      };
    }
    groups[noBukti].nominal += Number(row[3]) || 0;
    groups[noBukti].lineCount += 1;
  });

  return Object.keys(groups).map(function(k) { return groups[k]; })
    .sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
}

function postListMutasiDana_(ss, startDate, endDate) {
  const sh = ss.getSheetByName("MUTASI_DANA");
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  const items = [];

  data.forEach(function(row) {
    if (postIsPosted_(row[7])) return;
    if (String(row[9] || "").trim() !== "POST") return;
    if ((Number(row[5]) || 0) <= 0) return;
    if (!String(row[8] || "").trim()) return;
    if (!postInDateRange_(row[0], startDate, endDate)) return;
    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    const txId = String(row[8] || "").trim();
    items.push({
      id: "MUTASI_DANA::" + txId,
      modul: "MUTASI_DANA",
      ref: txId,
      transactionId: txId,
      tanggal: postFmtDate_(d),
      tanggalRaw: d.getTime(),
      deskripsi: String(row[1] || "") + ": " + String(row[3] || "") + " → " + String(row[4] || ""),
      nominal: Number(row[5]) || 0,
      lineCount: 1
    });
  });

  return items.sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
}

function postOneTransaction_(ss, itemId) {
  const parts = String(itemId || "").split("::");
  const modul = parts[0];
  const ref = parts.slice(1).join("::");
  if (!modul || !ref) throw new Error("ID transaksi tidak valid: " + itemId);

  if (modul === "PEMASUKAN") return postExecutePemasukan_(ss, ref);
  if (modul === "PEMBELIAN") return postExecutePembelian_(ss, ref);
  if (modul === "PELUNASAN_PIUTANG") return postExecutePelunasanPiutang_(ss, ref);
  if (modul === "PELUNASAN_UTANG") return postExecutePelunasanUtang_(ss, ref);
  if (modul === "JURNAL_MANUAL") return postExecuteJurnalManual_(ss, ref);
  if (modul === "MUTASI_DANA") return postExecuteMutasiDana_(ss, ref);
  throw new Error("Modul tidak dikenal: " + modul);
}

function postExecutePemasukan_(ss, invoiceNo) {
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 22).getValues();
  let count = 0;
  const target = String(invoiceNo).trim();

  data.forEach(function(r, i) {
    if (String(r[4] || "").trim() !== target) return;
    if (postIsPosted_(r[16])) return;
    if (String(r[19] || "").trim() !== "POST") return;
    const total = Number(r[11]) || 0;
    if (total <= 0) return;
    const transactionId = String(r[18] || "").trim();
    if (!transactionId) throw new Error("TX ID kosong pada invoice: " + target);

    postCallBackend_({
      modul: "PEMASUKAN",
      tanggalPesan: r[1],
      invoice: target,
      keterangan: String(r[6] || ""),
      total: total,
      bayar: Number(r[12]) || 0,
      status: r[14],
      tanggalBayar: r[15] || r[1],
      akunPendapatan: r[17] || "Pendapatan",
      rekening: String(r[20] || "").trim(),
      transactionId: transactionId
    });

    sh.getRange(i + 2, 17).setValue(true);
    count += 1;
  });

  if (count === 0) throw new Error("Tidak ada baris belum posting untuk invoice " + target);
  return count;
}

function postExecutePembelian_(ss, poNo) {
  const sh = ss.getSheetByName("PEMBELIAN");
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 18).getValues();
  let count = 0;
  const target = String(poNo).trim();

  data.forEach(function(r, i) {
    if (String(r[1] || "").trim() !== target) return;
    if (postIsPosted_(r[11])) return;
    if (String(r[16] || "").trim() !== "POST") return;
    const total = Number(r[7]) || 0;
    if (total <= 0) return;
    const transactionId = String(r[15] || "").trim();
    if (!transactionId) throw new Error("TX ID kosong pada PO: " + target);

    postCallBackend_({
      modul: "PEMBELIAN",
      tanggal: r[0],
      noDok: target,
      supplier: String(r[2] || ""),
      total: total,
      metode: r[8],
      akunPembelian: r[9],
      keterangan: String(r[3] || ""),
      bayar: Number(r[10]) || 0,
      tanggalBayar: r[13] || r[0],
      rekening: String(r[14] || "").trim(),
      transactionId: transactionId
    });

    sh.getRange(i + 2, 12).setValue(true);
    count += 1;
  });

  if (count === 0) throw new Error("Tidak ada baris belum posting untuk PO " + target);
  return count;
}

function postExecutePelunasanPiutang_(ss, transactionId) {
  const sh = ss.getSheetByName("PELUNASAN_PIUTANG");
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  const target = String(transactionId).trim();

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[7] || "").trim() !== target) continue;
    if (postIsPosted_(r[6])) throw new Error("Transaksi sudah diposting: " + target);
    const nominal = Number(r[3]) || 0;
    if (nominal <= 0) throw new Error("Nominal tidak valid");

    postCallBackend_({
      modul: "PELUNASAN_PIUTANG",
      tanggalBayar: r[0],
      invoice: String(r[1] || "").trim(),
      customer: String(r[2] || "").trim(),
      nominal: nominal,
      metode: String(r[4] || r[9] || "").trim(),
      rekening: String(r[4] || r[9] || "").trim(),
      keterangan: String(r[5] || "").trim(),
      transactionId: target
    });

    sh.getRange(i + 2, 7).setValue(true);
    return 1;
  }
  throw new Error("Pelunasan piutang tidak ditemukan: " + target);
}

function postExecutePelunasanUtang_(ss, transactionId) {
  const sh = ss.getSheetByName("PELUNASAN_UTANG");
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  const target = String(transactionId).trim();

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[7] || "").trim() !== target) continue;
    if (postIsPosted_(r[6])) throw new Error("Transaksi sudah diposting: " + target);
    const nominal = Number(r[3]) || 0;
    if (nominal <= 0) throw new Error("Nominal tidak valid");

    postCallBackend_({
      modul: "PELUNASAN_UTANG",
      tanggal: r[0],
      noDok: String(r[1] || "").trim(),
      supplier: String(r[2] || "").trim(),
      nominal: nominal,
      metode: String(r[4] || "").trim(),
      rekening: String(r[4] || "").trim(),
      keterangan: String(r[5] || "").trim(),
      transactionId: target
    });

    sh.getRange(i + 2, 7).setValue(true);
    return 1;
  }
  throw new Error("Pelunasan hutang tidak ditemukan: " + target);
}

function postExecuteJurnalManual_(ss, noBukti) {
  const sh = ss.getSheetByName("JURNAL_MANUAL");
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues();
  const target = String(noBukti).trim();
  const entries = [];

  data.forEach(function(r) {
    if (String(r[1] || "").trim() !== target) return;
    if (postIsPosted_(r[6])) return;
    if (String(r[8] || "").trim() !== "POST") return;
    entries.push({
      tanggal: r[0],
      noBukti: target,
      akun: String(r[2] || "").trim(),
      debit: Number(r[3]) || 0,
      kredit: Number(r[4]) || 0,
      keterangan: String(r[5] || "").trim(),
      transactionId: String(r[7] || "").trim()
    });
  });

  if (!entries.length) throw new Error("Jurnal tidak ditemukan atau sudah diposting: " + target);
  if (!entries[0].transactionId) throw new Error("TX ID kosong pada jurnal: " + target);

  postCallBackend_({ modul: "JURNAL_MANUAL", entries: entries });

  data.forEach(function(r, i) {
    if (String(r[1] || "").trim() === target) {
      sh.getRange(i + 2, 7).setValue(true);
    }
  });
  return 1;
}

function postExecuteMutasiDana_(ss, transactionId) {
  const sh = ss.getSheetByName("MUTASI_DANA");
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  const target = String(transactionId).trim();

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[8] || "").trim() !== target) continue;
    if (postIsPosted_(r[7])) throw new Error("Mutasi sudah diposting: " + target);
    if (String(r[9] || "").trim() !== "POST") throw new Error("Mutasi bukan aksi POST manual");
    const nominal = Number(r[5]) || 0;
    if (nominal <= 0) throw new Error("Nominal tidak valid");

    postCallBackend_({
      modul: "MUTASI_DANA",
      tanggal: r[0],
      jenis: String(r[1] || "").trim(),
      sumber: String(r[3] || "").trim(),
      tujuan: String(r[4] || "").trim(),
      nominal: nominal,
      keterangan: String(r[6] || "").trim(),
      transactionId: target
    });

    sh.getRange(i + 2, 8).setValue(true);
    return 1;
  }
  throw new Error("Mutasi tidak ditemukan: " + target);
}

function postSelectedTransactions(itemIds) {
  assertRole_(["owner", "akuntan"]);
  const ids = (itemIds || []).filter(function(id) { return String(id || "").trim(); });
  if (!ids.length) throw new Error("Pilih minimal 1 transaksi untuk diposting.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error("Sistem sedang memproses posting lain. Coba beberapa detik lagi.");
  }

  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const result = { posted: 0, lines: 0, failed: [], successRefs: [] };

  try {
    ids.forEach(function(itemId) {
      try {
        const lines = postOneTransaction_(ss, itemId);
        result.posted += 1;
        result.lines += Number(lines) || 1;
        result.successRefs.push(itemId);
      } catch (err) {
        result.failed.push({ id: itemId, message: String(err.message || err) });
      }
    });

    if (result.posted > 0) {
      SpreadsheetApp.flush();
      dashClearKeuanganCache_();
      syncBackendLaporanFromCoa_();
    }

    return result;
  } finally {
    lock.releaseLock();
  }
}
