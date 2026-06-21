// Jurnal manual & chart of accounts
// ==========================================
// JURNAL MANUAL
// ==========================================

function getChartOfAccounts() {
  authGuard_();
  const seen = {};

  const add = function(name) {
    const n = String(name || "").trim();
    if (n) seen[n] = true;
  };

  try {
    const ssBackend = openBackendSpreadsheet_();
    readMasterCoa_(ssBackend, false).forEach(function(c) { add(c.nama); });
    if (Object.keys(seen).length) {
      return Object.keys(seen).sort(function(a, b) { return a.localeCompare(b, "id"); });
    }
  } catch (e) {
    Logger.log("getChartOfAccounts backend: " + (e.message || e));
  }

  const ss = getDatabaseSpreadsheet_();
  readMasterProduk_(ss, true).forEach(function(p) { add(p.akun); });
  readMasterKasBank_(ss, true).forEach(function(k) { add(k.akunCoa); });
  readMasterKategoriPembelian_(ss, true).forEach(function(kat) { add(kat.akun); });

  const shJm = ss.getSheetByName("JURNAL_MANUAL");
  if (shJm && shJm.getLastRow() >= 2) {
    const n = shJm.getLastRow() - 1;
    shJm.getRange(2, 3, n, 1).getValues().forEach(function(r) { add(r[0]); });
  }

  return Object.keys(seen).sort(function(a, b) { return a.localeCompare(b, "id"); });
}

function scanMaxJurnalManualSeqForDate_(dateStr) {
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("JURNAL_MANUAL");
  if (!sh || sh.getLastRow() < 2) return 0;
  const vals = readSheetColumnValues_(sh, 8);
  let max = 0;
  const prefix = "TX-JM-" + dateStr + "-";
  vals.forEach(function(r) {
    const raw = String(r[0] || "").trim().toUpperCase();
    if (!raw.startsWith(prefix)) return;
    const m = raw.match(/^TX-JM-\d{8}-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return max;
}

function nextManualJournalMeta_(journalDate) {
  ensureSeqPropsFromSetting_();
  const d = journalDate ? new Date(journalDate + "T12:00:00") : new Date();
  const dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyyMMdd");
  const dateKey = "JM_SEQ_DATE";
  const seqKey = "JM_SEQ_NUM";

  let storedDate = String(getSeqProp_(dateKey) || "").trim();
  let seq = Number(getSeqProp_(seqKey));

  if (!storedDate || isNaN(seq)) {
    seq = scanMaxJurnalManualSeqForDate_(dateStr);
  } else if (storedDate !== dateStr) {
    seq = scanMaxJurnalManualSeqForDate_(dateStr);
  }

  seq += 1;
  setSeqProps_({
    [dateKey]: dateStr,
    [seqKey]: seq
  });

  return {
    transactionId: "TX-JM-" + dateStr + "-" + seq,
    noBukti: "JM-" + dateStr + "-" + String(seq).padStart(4, "0")
  };
}

function validateManualJournal_(p) {
  if (!p || !p.tanggal) throw new Error("Tanggal wajib diisi.");
  if (!p.lines || !Array.isArray(p.lines) || p.lines.length < 2) {
    throw new Error("Jurnal minimal 2 baris (debit dan kredit).");
  }

  let totalDebit = 0;
  let totalKredit = 0;

  p.lines.forEach((line, idx) => {
    const akun = String(line.akun || "").trim();
    const debit = Number(line.debit) || 0;
    const kredit = Number(line.kredit) || 0;

    if (!akun) throw new Error("Baris " + (idx + 1) + ": Akun wajib diisi.");
    if (debit < 0 || kredit < 0) throw new Error("Baris " + (idx + 1) + ": Nominal tidak boleh negatif.");
    if (debit > 0 && kredit > 0) throw new Error("Baris " + (idx + 1) + ": Isi debit ATAU kredit, bukan keduanya.");
    if (debit === 0 && kredit === 0) throw new Error("Baris " + (idx + 1) + ": Debit atau kredit harus diisi.");

    totalDebit += debit;
    totalKredit += kredit;
  });

  if (totalDebit === 0) throw new Error("Total jurnal harus lebih dari nol.");
  if (Math.round(totalDebit) !== Math.round(totalKredit)) {
    throw new Error("Total debit harus sama dengan total kredit.");
  }
}

function saveManualJournal(payload) {
  assertRole_(["owner", "akuntan"]);
  const lock = acquireSaveLock_("jurnal manual");

  try {
    validateManualJournal_(payload);

    const ss = getDatabaseSpreadsheet_();
    const sh = ss.getSheetByName("JURNAL_MANUAL");
    if (!sh) throw new Error("Sheet JURNAL_MANUAL belum dibuat!");

    const meta = nextManualJournalMeta_(payload.tanggal);
    const noBukti = normalizeRecordText_(payload.noBukti || "") || meta.noBukti;
    const transId = meta.transactionId;
    const tanggal = new Date(payload.tanggal + "T12:00:00");
    const keteranganUmum = normalizeRecordText_(payload.keterangan || "");

    const rows = payload.lines.map(function(line) {
      return [
        tanggal,
        noBukti,
        normalizeRecordText_(line.akun || ""),
        Number(line.debit) || 0,
        Number(line.kredit) || 0,
        normalizeRecordText_(line.keterangan || keteranganUmum || ""),
        false,
        transId,
        "POST"
      ];
    });

    const insertAt = sh.getLastRow() + 1;
    sh.getRange(insertAt, 1, rows.length, 9).setValues(rows);

    return {
      success: true,
      transactionId: transId,
      noBukti: noBukti,
      lineCount: rows.length
    };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function getManualJournalHistory(startDate, endDate) {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("JURNAL_MANUAL");
  if (!sh || sh.getLastRow() < 2) return [];

  const start = startDate ? new Date(startDate + "T00:00:00") : null;
  const end = endDate ? new Date(endDate + "T23:59:59") : null;
  const tz = Session.getScriptTimeZone();
  const data = sh.getDataRange().getValues();
  data.shift();

  const groups = {};

  data.forEach(function(row) {
    const rawDate = row[0];
    if (!rawDate) return;

    const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (isNaN(d.getTime())) return;
    if (start && d < start) return;
    if (end && d > end) return;

    const transId = String(row[7] || "").trim();
    if (!transId) return;

    if (!groups[transId]) {
      groups[transId] = {
        transactionId: transId,
        tanggal: Utilities.formatDate(d, tz, "dd/MM/yyyy"),
        tanggalRaw: d.getTime(),
        noBukti: String(row[1] || "").trim(),
        keterangan: String(row[5] || "").trim(),
        totalDebit: 0,
        lineCount: 0,
        isPosted: row[6] === true || String(row[6]).toUpperCase() === "TRUE"
      };
    }

    groups[transId].totalDebit += Number(row[3]) || 0;
    groups[transId].lineCount += 1;

    if (row[6] !== true && String(row[6]).toUpperCase() !== "TRUE") {
      groups[transId].isPosted = false;
    }
    if (!groups[transId].keterangan && row[5]) {
      groups[transId].keterangan = String(row[5]).trim();
    }
  });

  return Object.values(groups).sort(function(a, b) {
    return b.tanggalRaw - a.tanggalRaw;
  });
}

function getManualJournalDetail(transactionId) {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("JURNAL_MANUAL");
  if (!sh) throw new Error("Sheet JURNAL_MANUAL tidak ditemukan!");

  const data = sh.getDataRange().getValues();
  data.shift();
  const id = String(transactionId || "").trim();
  const lines = data.filter(function(r) {
    return String(r[7] || "").trim() === id;
  });

  if (lines.length === 0) throw new Error("Jurnal tidak ditemukan.");

  const first = lines[0];
  const d = first[0] instanceof Date ? first[0] : new Date(first[0]);
  let totalDebit = 0;
  let totalKredit = 0;

  const detailLines = lines.map(function(r) {
    const debit = Number(r[3]) || 0;
    const kredit = Number(r[4]) || 0;
    totalDebit += debit;
    totalKredit += kredit;
    return {
      akun: String(r[2] || "").trim(),
      debit: debit,
      kredit: kredit,
      keterangan: String(r[5] || "").trim()
    };
  });

  return {
    transactionId: id,
    tanggal: Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy"),
    noBukti: String(first[1] || "").trim(),
    isPosted: lines.every(function(r) {
      return r[6] === true || String(r[6]).toUpperCase() === "TRUE";
    }),
    lines: detailLines,
    totalDebit: totalDebit,
    totalKredit: totalKredit
  };
}

function testFetchData() {
  const data = getPurchaseOrderHistory("2026-01-01", "2026-12-31");
  Logger.log("Jumlah PO ditemukan: " + data.length);
  Logger.log(JSON.stringify(data));
}
