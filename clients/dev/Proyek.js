// Add-on Manajemen Proyek (event catering)
// ==========================================

const PROYEK_STATUS_ = ["DRAFT", "CONFIRMED", "BERJALAN", "SELESAI", "BATAL"];

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
