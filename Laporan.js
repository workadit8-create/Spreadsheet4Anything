// Laporan (backend engine)
// ==========================================
// MODUL LAPORAN (BACA DARI BACKEND ENGINE)
// Web app hanya menampilkan — perhitungan di spreadsheet backend
// ==========================================

const BACKEND_ENGINE_ID_DEFAULT = "171xtAp4xRNhXwLHQorHoLWi9DpxfE6lm8oG1FQwfG0k";
const BACKEND_WEBAPP_URL_DEFAULT =
  "https://script.google.com/macros/s/AKfycbwqNLUa0U6m-p9lzPwE9nYVhMbbp7qjE5IOG4mlKA8roxMXVMMNVduWBSI2iVuSKMCiaw/exec";
const BACKEND_API_KEY_DEFAULT = "AKUNTANSI_2026_SECRET";

const LAPORAN_TYPES_ = {
  neraca: {
    label: "Neraca",
    settingKey: "REPORT_SHEET_NERACA",
    candidates: ["NERACA", "Neraca"]
  },
  labaRugi: {
    label: "Laba Rugi",
    settingKey: "REPORT_SHEET_LABA_RUGI",
    candidates: ["LABA RUGI", "LABA_RUGI", "Laba Rugi", "L/R"]
  },
  arusKas: {
    label: "Arus Kas",
    settingKey: "REPORT_SHEET_ARUS_KAS",
    candidates: ["ARUS KAS", "ARUS_KAS", "Arus Kas"]
  },
  bukuBesar: {
    label: "Buku Besar",
    settingKey: "REPORT_SHEET_BUKU_BESAR",
    candidates: ["BUKU BESAR", "BUKU_BESAR", "Buku Besar"]
  }
};

function getBackendWebappUrl_() {
  const fromSetting = String(getSettingValue_("BACKEND_WEBAPP_URL") || "").trim();
  return fromSetting || BACKEND_WEBAPP_URL_DEFAULT;
}

function getBackendApiKey_() {
  const fromSetting = String(getSettingValue_("BACKEND_API_KEY") || "").trim();
  return fromSetting || BACKEND_API_KEY_DEFAULT;
}

/** Sync struktur laporan dari MASTER COA — direct (library) lalu API UrlFetchApp. */
function syncBackendLaporanFromCoa_() {
  let lastErr = "";

  try {
    const ss = openBackendSpreadsheet_();
    const direct = syncBackendLaporanDirect_(ss);
    if (direct && direct.ok) return direct;
    if (direct && (direct.message || direct.error)) {
      lastErr = String(direct.message || direct.error);
    }
  } catch (e) {
    lastErr = String(e.message || e);
    Logger.log("syncBackendLaporanFromCoa_ direct: " + lastErr);
  }

  try {
    const viaApi = syncBackendLaporanViaApi_();
    if (viaApi && viaApi.ok) return viaApi;
    if (viaApi && viaApi.error) lastErr = viaApi.error;
  } catch (e2) {
    lastErr = String(e2.message || e2);
    Logger.log("syncBackendLaporanFromCoa_ api: " + lastErr);
  }

  return { ok: false, message: lastErr || "Sinkron laporan gagal." };
}

function getBackendEngineId_() {
  const fromSetting = String(getSettingValue_("BACKEND_ENGINE_ID") || "").trim();
  return fromSetting || BACKEND_ENGINE_ID_DEFAULT;
}

let SS_BACKEND_ = null;
let SS_BACKEND_ID_ = null;

function openBackendSpreadsheet_() {
  const id = getBackendEngineId_();
  if (SS_BACKEND_ && SS_BACKEND_ID_ === id) return SS_BACKEND_;
  try {
    SS_BACKEND_ID_ = id;
    SS_BACKEND_ = SpreadsheetApp.openById(id);
    return SS_BACKEND_;
  } catch (e) {
    SS_BACKEND_ = null;
    SS_BACKEND_ID_ = null;
    throw new Error(
      "Tidak dapat membuka Backend Engine. Pastikan BACKEND_ENGINE_ID di SETTING benar " +
      "dan akun deploy web app punya akses ke spreadsheet backend."
    );
  }
}

function resolveBackendSheet_(ss, typeKey) {
  const cfg = LAPORAN_TYPES_[typeKey];
  if (!cfg) throw new Error("Jenis laporan tidak dikenal.");

  const customName = String(getSettingValue_(cfg.settingKey) || "").trim();
  if (customName) {
    const shCustom = ss.getSheetByName(customName);
    if (shCustom) return shCustom;
    throw new Error("Sheet laporan \"" + customName + "\" tidak ditemukan di backend.");
  }

  for (let i = 0; i < cfg.candidates.length; i++) {
    const sh = ss.getSheetByName(cfg.candidates[i]);
    if (sh) return sh;
  }

  throw new Error(
    "Sheet " + cfg.label + " tidak ditemukan. Buat sheet \"" + cfg.candidates[0] +
    "\" di backend, atau set " + cfg.settingKey + " di SETTING client."
  );
}

function colLettersToIndex_(letters) {
  let n = 0;
  const s = String(letters).toUpperCase();
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n;
}

function parseA1Cell_(a1) {
  const m = String(a1 || "").trim().match(/^([^!]+)!([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  return { sheet: m[1], col: colLettersToIndex_(m[2]), row: Number(m[3]) };
}

function applyBackendReportPeriod_(bulan, tahun) {
  const ss = openBackendSpreadsheet_();
  ensureBackendLaporanConfig_(ss);
  const sh = ss.getSheetByName("LAPORAN_CONFIG");
  const m = Number(bulan);
  const y = Number(tahun);

  if (!(m >= 1 && m <= 12)) {
    throw new Error("Bulan laporan tidak valid: " + bulan);
  }
  if (!(y >= 2000)) {
    throw new Error("Tahun laporan tidak valid: " + tahun);
  }

  const cur = readBackendReportPeriod_(ss);
  if (cur.bulan === m && cur.tahun === y) {
    return cur;
  }

  sh.getRange(2, 2).setValue(m);
  sh.getRange(3, 2).setValue(y);
  forceBackendLaporanRecalc_(ss, false);
  return readBackendReportPeriod_(ss);
}

/** Paksa rumus LAPORAN_CONFIG + sheet laporan hitung ulang sebelum dibaca web app. */
function forceBackendLaporanRecalc_(ss, light) {
  SpreadsheetApp.flush();
  const cfg = ss.getSheetByName("LAPORAN_CONFIG");
  if (cfg) {
    cfg.getRange(4, 2).getValue();
    cfg.getRange(5, 2).getValue();
  }
  ["NERACA", "LABA_RUGI", "ARUS_KAS"].forEach(function(name) {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() >= 2) {
      sh.getRange(2, 2).getValue();
      if (sh.getLastColumn() >= 3) {
        sh.getRange(5, 3).getValue();
      }
    }
  });
  SpreadsheetApp.flush();
  if (!light) {
    Utilities.sleep(200);
  }
}

/** Pastikan LAPORAN_CONFIG ada (tanpa dropdown — periode dari Web App). */
function ensureBackendLaporanConfig_(ss) {
  const sheetName = "LAPORAN_CONFIG";
  let sh = ss.getSheetByName(sheetName);
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const defaultBulan = Number(Utilities.formatDate(now, tz, "M"));
  const defaultTahun = Number(Utilities.formatDate(now, tz, "yyyy"));

  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.getRange(1, 1, 5, 3).setValues([
      ["Key", "Value", "Keterangan"],
      ["BULAN", defaultBulan, "Diatur dari Web App (Spreadsheet4Anything)"],
      ["TAHUN", defaultTahun, "Diatur dari Web App"],
      ["TGL_MULAI", "", "Otomatis: awal bulan (rumus)"],
      ["TGL_AKHIR", "", "Otomatis: akhir bulan (rumus)"]
    ]);
    sh.getRange(4, 2).setFormula("=DATE(B3,B2,1)");
    sh.getRange(5, 2).setFormula("=EOMONTH(B4,0)");
    sh.setFrozenRows(1);
    return;
  }

  sh.getRange(2, 2).setDataValidation(null);
  sh.getRange(3, 2).setDataValidation(null);

  const tglMulai = sh.getRange(4, 2);
  const tglAkhir = sh.getRange(5, 2);
  if (!tglMulai.getFormula()) tglMulai.setFormula("=DATE(B3,B2,1)");
  if (!tglAkhir.getFormula()) tglAkhir.setFormula("=EOMONTH(B4,0)");
}

function readBackendReportPeriod_(ss) {
  ensureBackendLaporanConfig_(ss);
  const sh = ss.getSheetByName("LAPORAN_CONFIG");
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  let bulan = Number(sh.getRange(2, 2).getValue());
  let tahun = Number(sh.getRange(3, 2).getValue());
  if (!(bulan >= 1 && bulan <= 12)) {
    bulan = Number(Utilities.formatDate(now, tz, "M"));
  }
  if (!(tahun >= 2000)) {
    tahun = Number(Utilities.formatDate(now, tz, "yyyy"));
  }
  return { bulan: bulan, tahun: tahun };
}

function getLaporanPeriode() {
  authGuard_();
  const ss = openBackendSpreadsheet_();
  return readBackendReportPeriod_(ss);
}

function trimSheetMatrix_(matrix) {
  if (!matrix || matrix.length === 0) return [];

  let lastRow = -1;
  for (let r = 0; r < matrix.length; r++) {
    const hasData = matrix[r].some(function(cell) {
      return String(cell || "").trim() !== "";
    });
    if (hasData) lastRow = r;
  }
  if (lastRow < 0) return [];

  let lastCol = 0;
  for (let r = 0; r <= lastRow; r++) {
    for (let c = matrix[r].length - 1; c >= 0; c--) {
      if (String(matrix[r][c] || "").trim() !== "") {
        if (c + 1 > lastCol) lastCol = c + 1;
        break;
      }
    }
  }
  if (lastCol < 1) lastCol = 1;

  const out = [];
  for (let r = 0; r <= lastRow; r++) {
    out.push(matrix[r].slice(0, lastCol));
  }
  return out;
}

function readReportSheetMatrix_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];

  const maxRows = Math.min(lastRow, 500);
  const maxCols = Math.min(lastCol, 20);
  const matrix = sh.getRange(1, 1, maxRows, maxCols).getDisplayValues();
  return trimSheetMatrix_(matrix);
}

function getLaporanMeta() {
  authGuard_();
  const ss = openBackendSpreadsheet_();
  const available = {};
  const periode = readBackendReportPeriod_(ss);

  Object.keys(LAPORAN_TYPES_).forEach(function(key) {
    try {
      available[key] = resolveBackendSheet_(ss, key).getName();
    } catch (e) {
      available[key] = null;
    }
  });

  return {
    backendId: getBackendEngineId_(),
    available: available,
    periodConfigured: true,
    periodSource: "webapp",
    periodDefault: "LAPORAN_CONFIG (ditulis dari Web App)",
    bulan: periode.bulan,
    tahun: periode.tahun
  };
}

function getLaporanTabel(reportType, bulan, tahun, forceSync) {
  authGuard_();
  const typeKey = String(reportType || "").trim();
  if (!LAPORAN_TYPES_[typeKey]) {
    throw new Error("Jenis laporan tidak valid.");
  }

  applyBackendReportPeriod_(bulan, tahun);

  if (forceSync) {
    syncBackendLaporanFromCoa_();
  }

  const ss = openBackendSpreadsheet_();
  if (typeKey === "bukuBesar") {
    refreshBackendBukuBesarSheet_(ss);
    forceBackendLaporanRecalc_(ss, true);
  }
  const sh = resolveBackendSheet_(ss, typeKey);
  const rows = readReportSheetMatrix_(sh);
  const periodeTerapan = readBackendReportPeriod_(ss);

  return {
    type: typeKey,
    label: LAPORAN_TYPES_[typeKey].label,
    sheetName: sh.getName(),
    bulan: Number(bulan) || null,
    tahun: Number(tahun) || null,
    periodeTerapan: periodeTerapan,
    rows: rows,
    rowCount: rows.length
  };
}

function getDaftarAkunLaporan() {
  authGuard_();
  const ss = openBackendSpreadsheet_();
  const sh = ss.getSheetByName("JURNAL_UMUM");
  if (!sh || sh.getLastRow() < 2) return [];

  const data = sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues();
  const map = {};
  data.forEach(function(r) {
    const name = String(r[0] || "").trim();
    if (name) map[name] = true;
  });
  return Object.keys(map).sort();
}

function getBukuBesarJurnal(akun, startDate, endDate) {
  authGuard_();
  const akunName = String(akun || "").trim();
  if (!akunName) throw new Error("Nama akun wajib dipilih.");

  const ss = openBackendSpreadsheet_();
  const sh = ss.getSheetByName("JURNAL_UMUM");
  if (!sh) throw new Error("Sheet JURNAL_UMUM tidak ditemukan di backend.");

  const startObj = startDate ? new Date(startDate) : null;
  const endObj = endDate ? new Date(endDate) : null;
  if (startObj && !isNaN(startObj.getTime())) startObj.setHours(0, 0, 0, 0);
  if (endObj && !isNaN(endObj.getTime())) endObj.setHours(23, 59, 59, 999);

  const data = sh.getDataRange().getValues();
  const lines = [];
  let saldo = 0;

  for (let i = 1; i < data.length; i++) {
    const account = String(data[i][2] || "").trim();
    if (account !== akunName) continue;

    const tgl = new Date(data[i][0]);
    if (isNaN(tgl.getTime())) continue;
    const t = tgl.getTime();
    if (startObj && t < startObj.getTime()) continue;
    if (endObj && t > endObj.getTime()) continue;

    const debit = Number(data[i][3]) || 0;
    const kredit = Number(data[i][4]) || 0;
    saldo += debit - kredit;

    lines.push({
      tanggal: Utilities.formatDate(tgl, Session.getScriptTimeZone(), "yyyy-MM-dd"),
      referensi: String(data[i][1] || ""),
      keterangan: String(data[i][5] || ""),
      debit: debit,
      kredit: kredit,
      saldo: saldo
    });
  }

  return {
    akun: akunName,
    lines: lines,
    saldoAkhir: saldo
  };
}

// --- Buku Besar backend refresh (sinkron dengan BACKENDengine/rebuildLaporanAkuntansi.js) ---

const BUKU_BESAR_CFG_SHEET_ = 'LAPORAN_CONFIG';

function refreshBackendBukuBesarSheet_(ss) {
  const sh = resolveBackendSheet_(ss, 'bukuBesar');
  bbUnprotectSheet_(sh);
  try {
    const title = String(sh.getRange(1, 1).getValue() || '');
    if (title.indexOf('BUKU BESAR') < 0) {
      sh.clear();
      sh.getRange(1, 1).setValue('LAPORAN BUKU BESAR');
      sh.getRange(1, 1, 1, 6).merge().setFontWeight('bold').setBackground('#dbeafe');
      sh.getRange(2, 1).setValue('Periode');
      bbSetPeriodeFormulas_(sh, 2);
    }
    const startRow = 4;
    const lr = sh.getLastRow();
    if (lr >= startRow) {
      sh.getRange(startRow, 1, lr - startRow + 1, 6).clearContent().clearFormat();
    }
    bbPopulateBukuBesarBody_(ss, sh, startRow);
    bbFormatBukuBesarSheet_(sh);
  } finally {
    bbProtectSheet_(sh);
  }
}

function bbSetPeriodeFormulas_(sh, row) {
  sh.getRange(row, 2).setFormula('=' + BUKU_BESAR_CFG_SHEET_ + '!$B$4');
  sh.getRange(row, 3).setFormula('=' + BUKU_BESAR_CFG_SHEET_ + '!$B$5');
}

function bbUnprotectSheet_(sh) {
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function(p) { p.remove(); });
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function(p) { p.remove(); });
}

function bbProtectSheet_(sh) {
  if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length > 0) return;
  sh.protect().setDescription('Proteksi laporan — refresh otomatis dari web app');
}

function bbPopulateBukuBesarBody_(ss, sh, startRow) {
  const periode = bbReadPeriodeTanggalConfig_(ss);
  const coaList = bbReadCoaList_(ss);
  const jurnal = bbReadJurnalUmumLines_(ss);
  const coaByName = {};
  coaList.forEach(function(c) { coaByName[c.nama] = c; });

  const extraAkun = {};
  jurnal.forEach(function(l) {
    if (l.akun && !coaByName[l.akun]) extraAkun[l.akun] = true;
  });
  Object.keys(extraAkun).sort().forEach(function(nama) {
    coaList.push({ no: '', nama: nama, tipe: '', sub: '', saldoNormal: 'Debit' });
  });

  const rows = [];
  const headerRows = [];
  const subtotalRows = [];
  const dateLineRows = [];

  coaList.forEach(function(coa) {
    const block = bbBuildAccountBlock_(coa, jurnal, periode.mulai, periode.akhir);
    if (!block) return;

    rows.push([coa.no ? coa.no + ' — ' + coa.nama : coa.nama, '', '', '', '', '']);
    headerRows.push(rows.length);
    rows.push(['Saldo Awal Periode', '', '', '', '', block.saldoAwal]);
    subtotalRows.push(rows.length);
    rows.push(['Tanggal', 'No. Bukti', 'Keterangan', 'Debit', 'Kredit', 'Saldo']);
    headerRows.push(rows.length);

    block.lines.forEach(function(line) {
      rows.push([line.tanggal, line.invoice, line.ket, line.debit || '', line.kredit || '', line.saldo]);
      dateLineRows.push(rows.length);
    });

    rows.push(['Saldo Akhir Periode', '', '', '', '', block.saldoAkhir]);
    subtotalRows.push(rows.length);
    rows.push(['', '', '', '', '', '']);
  });

  if (rows.length === 0) {
    sh.getRange(startRow, 1).setValue('(Tidak ada mutasi jurnal untuk periode ini)');
    return;
  }

  sh.getRange(startRow, 1, rows.length, 6).setValues(rows);
  dateLineRows.forEach(function(i) {
    sh.getRange(startRow + i - 1, 1).setNumberFormat('dd/mm/yyyy');
  });

  const fmt = bbRupiahFormat_();
  headerRows.forEach(function(i) {
    const absRow = startRow + i - 1;
    sh.getRange(absRow, 1, 1, 6).setFontWeight('bold').setBackground('#ecfdf5');
  });
  subtotalRows.forEach(function(i) {
    const absRow = startRow + i - 1;
    sh.getRange(absRow, 1, 1, 2).setFontWeight('bold');
    sh.getRange(absRow, 6).setFontWeight('bold').setNumberFormat(fmt);
  });
  sh.getRange(startRow, 4, rows.length, 3).setNumberFormat(fmt);
}

function bbBuildAccountBlock_(coa, jurnal, mulai, akhir) {
  const nama = coa.nama;
  const debitNormal = String(coa.saldoNormal || 'Debit').toLowerCase() !== 'kredit';
  const before = [];
  const inPeriod = [];

  jurnal.forEach(function(l) {
    if (l.akun !== nama) return;
    if (bbDateBefore_(l.tanggal, mulai)) before.push(l);
    else if (bbDateInPeriod_(l.tanggal, mulai, akhir)) inPeriod.push(l);
  });

  const saldoAwal = bbSaldoFromLines_(before, debitNormal);
  if (saldoAwal === 0 && inPeriod.length === 0) return null;

  inPeriod.sort(function(a, b) {
    const ta = bbDateOnly_(a.tanggal).getTime();
    const tb = bbDateOnly_(b.tanggal).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.invoice).localeCompare(String(b.invoice));
  });

  let running = saldoAwal;
  const lines = inPeriod.map(function(l) {
    if (debitNormal) running += l.debit - l.kredit;
    else running += l.kredit - l.debit;
    return {
      tanggal: l.tanggal,
      invoice: l.invoice,
      ket: l.ket,
      debit: l.debit,
      kredit: l.kredit,
      saldo: running
    };
  });

  return { saldoAwal: saldoAwal, lines: lines, saldoAkhir: running };
}

function bbSaldoFromLines_(lines, debitNormal) {
  let s = 0;
  lines.forEach(function(l) {
    if (debitNormal) s += l.debit - l.kredit;
    else s += l.kredit - l.debit;
  });
  return s;
}

function bbReadPeriodeTanggalConfig_(ss) {
  const sh = ss.getSheetByName(BUKU_BESAR_CFG_SHEET_);
  if (!sh) throw new Error('Sheet LAPORAN_CONFIG tidak ditemukan di backend.');
  SpreadsheetApp.flush();
  const mulai = sh.getRange(4, 2).getValue();
  const akhir = sh.getRange(5, 2).getValue();
  if (!(mulai instanceof Date) || !(akhir instanceof Date)) {
    throw new Error('Tanggal periode LAPORAN_CONFIG tidak valid.');
  }
  return { mulai: mulai, akhir: akhir };
}

function bbReadCoaList_(ss) {
  const sh = ss.getSheetByName('MASTER COA');
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  return data.map(function(r) {
    return {
      no: String(r[0] || ''),
      nama: String(r[1] || '').trim(),
      tipe: String(r[2] || ''),
      sub: String(r[3] || ''),
      saldoNormal: String(r[4] || 'Debit')
    };
  }).filter(function(c) { return c.nama; });
}

function bbReadJurnalUmumLines_(ss) {
  const sh = ss.getSheetByName('JURNAL_UMUM');
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  const out = [];
  data.forEach(function(r) {
    const akun = String(r[2] || '').trim();
    if (!akun) return;
    const tgl = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(tgl.getTime())) return;
    out.push({
      tanggal: tgl,
      invoice: String(r[1] || ''),
      akun: akun,
      debit: Number(r[3]) || 0,
      kredit: Number(r[4]) || 0,
      ket: String(r[5] || '')
    });
  });
  return out;
}

function bbDateOnly_(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

function bbDateBefore_(d, boundary) {
  return bbDateOnly_(d).getTime() < bbDateOnly_(boundary).getTime();
}

function bbDateInPeriod_(d, mulai, akhir) {
  const t = bbDateOnly_(d).getTime();
  return t >= bbDateOnly_(mulai).getTime() && t <= bbDateOnly_(akhir).getTime();
}

function bbRupiahFormat_() {
  return '[$Rp-420] #.##0;[$Rp-420] (#.##0)';
}

function bbFormatBukuBesarSheet_(sh) {
  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 120);
  sh.setColumnWidth(3, 300);
  sh.setColumnWidth(4, 120);
  sh.setColumnWidth(5, 120);
  sh.setColumnWidth(6, 130);
}
