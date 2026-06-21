// Add-on Manajemen Proyek (event catering)
// ==========================================

const PROYEK_STATUS_ = ["DRAFT", "CONFIRMED", "BERJALAN", "SELESAI", "BATAL"];

/** Kolom 1-based di sheet transaksi (append — data lama aman). */
const PROYEK_COL_QUOTATION_ = 14;
const PROYEK_COL_PR_ = 15;
const PROYEK_COL_PEMBELIAN_ = 19;
const PROYEK_COL_PEMASUKAN_ = 23;
const PROYEK_COL_HEADER_ = "Kode Proyek";

function normalizeKodeProyek_(val) {
  return String(val || "").trim().toUpperCase();
}

function ensureSheetProyekColumn_(sh, colNum) {
  if (!sh) return;
  const needCol = Math.max(sh.getLastColumn(), colNum);
  if (sh.getLastColumn() < colNum) {
    sh.getRange(1, colNum).setValue(PROYEK_COL_HEADER_);
    return;
  }
  const h = String(sh.getRange(1, colNum).getValue() || "").trim();
  if (!h) sh.getRange(1, colNum).setValue(PROYEK_COL_HEADER_);
}

function readRowKodeProyek_(row, colIndex) {
  if (!row || row.length < colIndex) return "";
  return normalizeKodeProyek_(row[colIndex - 1]);
}

function isAddonProjectEnabled_() {
  return typeof ENABLE_ADDON_PROJECT !== "undefined" && ENABLE_ADDON_PROJECT === true;
}

function assertAddonProject_() {
  if (!isAddonProjectEnabled_()) {
    throw new Error("Add-on Manajemen Proyek tidak aktif untuk client ini.");
  }
}

function assertProyekEditRole_() {
  assertRole_(["owner", "staff"]);
}

function ensureMasterProyekSheet_(ss) {
  let sh = ss.getSheetByName("MASTER_PROYEK");
  if (!sh) {
    sh = ss.insertSheet("MASTER_PROYEK");
    sh.appendRow([
      "Kode", "Nama Event", "Customer", "Tanggal Event", "Lokasi", "Pax",
      "Status", "PIC", "Catatan", "Quotation No", "Aktif"
    ]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function formatProyekDate_(val) {
  if (!val) return "";
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(val || "").trim();
}

function normalizeProyekStatus_(val) {
  const s = String(val || "").trim().toUpperCase();
  if (PROYEK_STATUS_.indexOf(s) >= 0) return s;
  return "DRAFT";
}

function findProyekRowByKode_(sh, kode) {
  const target = String(kode || "").trim().toUpperCase();
  if (!target || sh.getLastRow() < 2) return 0;
  const codes = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < codes.length; i++) {
    if (String(codes[i][0] || "").trim().toUpperCase() === target) return i + 2;
  }
  return 0;
}

function rowToProyekDto_(row) {
  return {
    kode: String(row[0] || "").trim(),
    nama: String(row[1] || "").trim(),
    customer: String(row[2] || "").trim(),
    tanggalEvent: formatProyekDate_(row[3]),
    lokasi: String(row[4] || "").trim(),
    pax: Number(row[5]) || 0,
    status: normalizeProyekStatus_(row[6]),
    pic: String(row[7] || "").trim(),
    catatan: String(row[8] || "").trim(),
    quotationNo: String(row[9] || "").trim(),
    aktif: masterIsActive_(row[10])
  };
}

function readMasterProyek_(ss, options) {
  options = options || {};
  ensureMasterProyekSheet_(ss);
  const sh = ss.getSheetByName("MASTER_PROYEK");
  if (sh.getLastRow() < 2) return [];

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  const out = [];
  const statusFilter = options.status ? String(options.status).trim().toUpperCase() : "";
  const search = String(options.search || "").trim().toLowerCase();
  const activeOnly = options.activeOnly !== false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  data.forEach(function(row) {
    const dto = rowToProyekDto_(row);
    if (!dto.kode) return;
    if (activeOnly && !dto.aktif) return;
    if (statusFilter && statusFilter !== "ALL" && dto.status !== statusFilter) return;
    if (options.upcomingOnly) {
      if (!dto.tanggalEvent) return;
      const ev = new Date(dto.tanggalEvent + "T12:00:00");
      if (isNaN(ev.getTime()) || ev.getTime() < today.getTime()) return;
      if (dto.status === "SELESAI" || dto.status === "BATAL") return;
    }
    if (search) {
      const blob = [
        dto.kode, dto.nama, dto.customer, dto.lokasi, dto.pic, dto.quotationNo
      ].join(" ").toLowerCase();
      if (blob.indexOf(search) < 0) return;
    }
    out.push(dto);
  });

  out.sort(function(a, b) {
    const da = a.tanggalEvent || "9999-99-99";
    const db = b.tanggalEvent || "9999-99-99";
    if (da !== db) return da.localeCompare(db);
    return a.kode.localeCompare(b.kode, "id");
  });
  return out;
}

function nextProyekKode_(ss) {
  return nextDocNumber_("PRJ", "PRJ_SEQ_DATE", "PRJ_SEQ_NUM", "MASTER_PROYEK", 0, ss);
}

function validateProyekPayload_(p) {
  if (!p.nama || !String(p.nama).trim()) throw new Error("Nama event wajib diisi.");
  if (!p.customer || !String(p.customer).trim()) throw new Error("Customer wajib dipilih.");
  if (!p.tanggalEvent) throw new Error("Tanggal event wajib diisi.");
  const ev = new Date(p.tanggalEvent + "T12:00:00");
  if (isNaN(ev.getTime())) throw new Error("Tanggal event tidak valid.");
}

function getProyekMeta() {
  authGuard_();
  return {
    enabled: isAddonProjectEnabled_(),
    statuses: PROYEK_STATUS_.slice()
  };
}

function listProyek(filters) {
  authGuard_();
  assertAddonProject_();
  const ss = getDatabaseSpreadsheet_();
  return readMasterProyek_(ss, filters || {});
}

function listProyekForDropdown() {
  authGuard_();
  assertAddonProject_();
  const ss = getDatabaseSpreadsheet_();
  return readMasterProyek_(ss, { activeOnly: true }).filter(function(p) {
    return p.status !== "BATAL" && p.status !== "SELESAI";
  }).map(function(p) {
    return {
      kode: p.kode,
      label: p.kode + " — " + p.nama + (p.tanggalEvent ? " (" + p.tanggalEvent + ")" : ""),
      nama: p.nama,
      customer: p.customer,
      tanggalEvent: p.tanggalEvent,
      status: p.status
    };
  });
}

function saveProyek(payload) {
  authGuard_();
  assertAddonProject_();
  assertProyekEditRole_();
  validateProyekPayload_(payload);

  const lock = acquireSaveLock_("proyek");
  try {
    const ss = getDatabaseSpreadsheet_();
    const sh = ensureMasterProyekSheet_(ss);
    const aktif = payload.aktif === false ? "TIDAK" : "YA";
    let kode = String(payload.kode || "").trim().toUpperCase();
    const tanggalEvent = new Date(payload.tanggalEvent + "T12:00:00");
    const row = [
      kode,
      normalizeRecordText_(payload.nama),
      normalizeRecordText_(payload.customer),
      tanggalEvent,
      normalizeRecordText_(payload.lokasi),
      Number(payload.pax) || 0,
      normalizeProyekStatus_(payload.status),
      normalizeRecordText_(payload.pic),
      String(payload.catatan || "").trim(),
      String(payload.quotationNo || "").trim().toUpperCase(),
      aktif
    ];

    let rowNum = kode ? findProyekRowByKode_(sh, kode) : 0;
    if (rowNum > 0) {
      sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
    } else {
      kode = nextProyekKode_(ss);
      row[0] = kode;
      sh.appendRow(row);
    }

    return { success: true, kode: kode };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function updateProyekStatus(kode, status) {
  authGuard_();
  assertAddonProject_();
  assertProyekEditRole_();

  const nextStatus = normalizeProyekStatus_(status);
  const lock = acquireSaveLock_("proyek status");
  try {
    const ss = getDatabaseSpreadsheet_();
    const sh = ensureMasterProyekSheet_(ss);
    const rowNum = findProyekRowByKode_(sh, kode);
    if (!rowNum) throw new Error("Proyek tidak ditemukan: " + kode);
    sh.getRange(rowNum, 7).setValue(nextStatus);
    return { success: true, kode: kode, status: nextStatus };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function proyekDateInRange_(dateVal, startDate, endDate) {
  if (!startDate && !endDate) return true;
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const t = d.getTime();
  if (startDate) {
    const s = new Date(startDate + "T00:00:00").getTime();
    if (t < s) return false;
  }
  if (endDate) {
    const e = new Date(endDate + "T23:59:59").getTime();
    if (t > e) return false;
  }
  return true;
}

function proyekPeriodFromMonthYear_(bulan, tahun) {
  const m = Number(bulan);
  const y = Number(tahun);
  if (!(m >= 1 && m <= 12) || !(y >= 2000)) return { start: "", end: "" };
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return {
    start: y + "-" + mm + "-01",
    end: y + "-" + mm + "-" + String(lastDay).padStart(2, "0")
  };
}

function buildProyekLrRows_(ss, startDate, endDate, options) {
  options = options || {};
  const pendapatanMap = {};
  const bebanMap = {};

  const shIn = ss.getSheetByName("PEMASUKAN");
  if (shIn && shIn.getLastRow() >= 2) {
    const cols = Math.max(shIn.getLastColumn(), PROYEK_COL_PEMASUKAN_);
    const data = shIn.getRange(2, 1, shIn.getLastRow() - 1, cols).getValues();
    data.forEach(function(row) {
      const kode = readRowKodeProyek_(row, PROYEK_COL_PEMASUKAN_);
      if (!kode) return;
      if (!proyekDateInRange_(row[1], startDate, endDate)) return;
      pendapatanMap[kode] = (pendapatanMap[kode] || 0) + (Number(row[11]) || 0);
    });
  }

  const shPb = ss.getSheetByName("PEMBELIAN");
  if (shPb && shPb.getLastRow() >= 2) {
    const cols = Math.max(shPb.getLastColumn(), PROYEK_COL_PEMBELIAN_);
    const data = shPb.getRange(2, 1, shPb.getLastRow() - 1, cols).getValues();
    data.forEach(function(row) {
      const kode = readRowKodeProyek_(row, PROYEK_COL_PEMBELIAN_);
      if (!kode) return;
      if (!proyekDateInRange_(row[0], startDate, endDate)) return;
      bebanMap[kode] = (bebanMap[kode] || 0) + (Number(row[7]) || 0);
    });
  }

  const master = readMasterProyek_(ss, { activeOnly: false });
  const masterMap = {};
  master.forEach(function(p) { masterMap[p.kode] = p; });

  const allKodes = {};
  Object.keys(pendapatanMap).forEach(function(k) { allKodes[k] = true; });
  Object.keys(bebanMap).forEach(function(k) { allKodes[k] = true; });
  if (options.includeEmpty !== false) {
    master.forEach(function(p) { allKodes[p.kode] = true; });
  }

  const statusFilter = options.status ? String(options.status).trim().toUpperCase() : "";
  const kodeFilter = normalizeKodeProyek_(options.kodeProyek);

  const rows = [];
  Object.keys(allKodes).forEach(function(kode) {
    const meta = masterMap[kode] || {
      kode: kode,
      nama: kode,
      customer: "",
      status: "",
      tanggalEvent: "",
      lokasi: "",
      pic: ""
    };
    if (statusFilter && statusFilter !== "ALL" && meta.status !== statusFilter) return;
    if (kodeFilter && kode !== kodeFilter) return;

    const pendapatan = pendapatanMap[kode] || 0;
    const beban = bebanMap[kode] || 0;
    if (options.includeEmpty === false && pendapatan === 0 && beban === 0) return;

    const margin = pendapatan - beban;
    rows.push({
      kode: kode,
      nama: meta.nama,
      customer: meta.customer,
      tanggalEvent: meta.tanggalEvent,
      status: meta.status,
      lokasi: meta.lokasi,
      pic: meta.pic,
      pendapatan: pendapatan,
      beban: beban,
      margin: margin,
      marginPct: pendapatan > 0 ? Math.round((margin / pendapatan) * 1000) / 10 : 0
    });
  });

  rows.sort(function(a, b) {
    if (b.margin !== a.margin) return b.margin - a.margin;
    return a.kode.localeCompare(b.kode, "id");
  });

  let totalPendapatan = 0;
  let totalBeban = 0;
  rows.forEach(function(r) {
    totalPendapatan += r.pendapatan;
    totalBeban += r.beban;
  });
  const totalMargin = totalPendapatan - totalBeban;

  return {
    rows: rows,
    totals: {
      pendapatan: totalPendapatan,
      beban: totalBeban,
      margin: totalMargin,
      marginPct: totalPendapatan > 0 ? Math.round((totalMargin / totalPendapatan) * 1000) / 10 : 0
    },
    periode: { start: startDate || "", end: endDate || "" }
  };
}

function getLaporanLrProyek(filters) {
  authGuard_();
  assertAddonProject_();
  const ss = getDatabaseSpreadsheet_();
  filters = filters || {};
  return buildProyekLrRows_(ss, filters.startDate || "", filters.endDate || "", {
    status: filters.status || "",
    kodeProyek: filters.kodeProyek || "",
    includeEmpty: false
  });
}

function proyekFormatTxDate_(val) {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function buildProyekLrDetail_(ss, kode, startDate, endDate) {
  const target = normalizeKodeProyek_(kode);
  if (!target) throw new Error("Kode proyek tidak valid.");

  const pemasukan = [];
  const shIn = ss.getSheetByName("PEMASUKAN");
  if (shIn && shIn.getLastRow() >= 2) {
    const cols = Math.max(shIn.getLastColumn(), PROYEK_COL_PEMASUKAN_);
    const data = shIn.getRange(2, 1, shIn.getLastRow() - 1, cols).getValues();
    data.forEach(function(row) {
      if (readRowKodeProyek_(row, PROYEK_COL_PEMASUKAN_) !== target) return;
      if (!proyekDateInRange_(row[1], startDate, endDate)) return;
      pemasukan.push({
        tanggal: proyekFormatTxDate_(row[1]),
        invoiceNo: String(row[4] || "").trim(),
        customer: String(row[5] || "").trim(),
        produk: String(row[6] || "").trim(),
        qty: Number(row[7]) || 0,
        satuan: String(row[8] || "").trim(),
        total: Number(row[11]) || 0,
        akun: String(row[17] || "").trim()
      });
    });
  }

  const pembelian = [];
  const shPb = ss.getSheetByName("PEMBELIAN");
  if (shPb && shPb.getLastRow() >= 2) {
    const cols = Math.max(shPb.getLastColumn(), PROYEK_COL_PEMBELIAN_);
    const data = shPb.getRange(2, 1, shPb.getLastRow() - 1, cols).getValues();
    data.forEach(function(row) {
      if (readRowKodeProyek_(row, PROYEK_COL_PEMBELIAN_) !== target) return;
      if (!proyekDateInRange_(row[0], startDate, endDate)) return;
      pembelian.push({
        tanggal: proyekFormatTxDate_(row[0]),
        poNo: String(row[1] || "").trim(),
        supplier: String(row[2] || "").trim(),
        barang: String(row[3] || "").trim(),
        qty: Number(row[4]) || 0,
        satuan: String(row[5] || "").trim(),
        total: Number(row[7]) || 0,
        akun: String(row[9] || "").trim()
      });
    });
  }

  pemasukan.sort(function(a, b) {
    if (b.tanggal !== a.tanggal) return b.tanggal.localeCompare(a.tanggal);
    return a.invoiceNo.localeCompare(b.invoiceNo, "id");
  });
  pembelian.sort(function(a, b) {
    if (b.tanggal !== a.tanggal) return b.tanggal.localeCompare(a.tanggal);
    return a.poNo.localeCompare(b.poNo, "id");
  });

  let pendapatan = 0;
  let beban = 0;
  pemasukan.forEach(function(r) { pendapatan += r.total; });
  pembelian.forEach(function(r) { beban += r.total; });
  const margin = pendapatan - beban;

  let proyekMeta = null;
  readMasterProyek_(ss, { activeOnly: false }).forEach(function(p) {
    if (p.kode === target) proyekMeta = p;
  });

  return {
    kode: target,
    proyek: proyekMeta || { kode: target, nama: target, customer: "", tanggalEvent: "", status: "" },
    periode: { start: startDate || "", end: endDate || "" },
    pemasukan: pemasukan,
    pembelian: pembelian,
    totals: {
      pendapatan: pendapatan,
      beban: beban,
      margin: margin,
      marginPct: pendapatan > 0 ? Math.round((margin / pendapatan) * 1000) / 10 : 0
    }
  };
}

function getLaporanLrProyekDetail(payload) {
  authGuard_();
  assertAddonProject_();
  payload = payload || {};
  const kode = normalizeKodeProyek_(payload.kode);
  if (!kode) throw new Error("Kode proyek wajib diisi.");
  const ss = getDatabaseSpreadsheet_();
  return buildProyekLrDetail_(ss, kode, payload.startDate || "", payload.endDate || "");
}

function getDashboardProyekSummary_(ss, bulan, tahun) {
  if (!isAddonProjectEnabled_()) return null;

  const period = proyekPeriodFromMonthYear_(bulan, tahun);
  const lr = buildProyekLrRows_(ss, period.start, period.end, { includeEmpty: false });
  const upcoming = readMasterProyek_(ss, { activeOnly: true, upcomingOnly: true });
  const lrMap = {};
  lr.rows.forEach(function(r) { lrMap[r.kode] = r; });

  return {
    periode: period,
    upcomingCount: upcoming.length,
    activeWithTag: lr.rows.length,
    lrTotals: lr.totals,
    upcoming: upcoming.slice(0, 5).map(function(p) {
      const fin = lrMap[p.kode] || { pendapatan: 0, beban: 0, margin: 0, marginPct: 0 };
      return {
        kode: p.kode,
        nama: p.nama,
        customer: p.customer,
        tanggalEvent: p.tanggalEvent,
        lokasi: p.lokasi,
        status: p.status,
        pic: p.pic,
        pendapatan: fin.pendapatan,
        beban: fin.beban,
        margin: fin.margin,
        marginPct: fin.marginPct
      };
    })
  };
}
