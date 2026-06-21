// Purchase Request
// ==========================================
// PURCHASE REQUEST
// ==========================================

function ensurePurchaseRequestSheet_(ss) {
  let sh = ss.getSheetByName("PURCHASE_REQUEST");
  if (!sh) {
    sh = ss.insertSheet("PURCHASE_REQUEST");
    sh.appendRow([
      "Tanggal", "No PR", "Supplier", "Kategori", "Sub-Kategori", "Nama Barang",
      "Qty", "Satuan", "Estimasi Harga", "Diskon", "Total Estimasi", "Status",
      "PO No", "Keterangan", PROYEK_COL_HEADER_
    ]);
  }
  ensureSheetProyekColumn_(sh, PROYEK_COL_PR_);
  return sh;
}

function nextPRNumber_(ss) {
  return nextDocNumber_("PR", "PR_SEQ_DATE", "PR_SEQ_NUM", "PURCHASE_REQUEST", 1, ss);
}

function allocatePRSaveIds_(ss) {
  ensureSeqPropsFromSetting_();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const dateKey = "PR_SEQ_DATE";
  const seqKey = "PR_SEQ_NUM";

  let storedDate = String(getSeqProp_(dateKey) || "").trim();
  let prSeq = Number(getSeqProp_(seqKey));
  if (!storedDate || isNaN(prSeq)) {
    prSeq = scanMaxDocSeqForDate_("PURCHASE_REQUEST", 1, "PR", today, ss);
    storedDate = today;
  } else if (storedDate !== today) {
    prSeq = scanMaxDocSeqForDate_("PURCHASE_REQUEST", 1, "PR", today, ss);
    storedDate = today;
  }
  prSeq += 1;

  setSeqProps_({
    [dateKey]: today,
    [seqKey]: prSeq
  });

  return "PR-" + today + "-" + String(prSeq).padStart(4, "0");
}

function validatePurchaseRequest_(p) {
  if (!p.tanggal) throw new Error("Tanggal PR wajib diisi.");
  if (!p.items || !p.items.length) throw new Error("Minimal harus ada 1 barang.");

  p.items.forEach(function(item, idx) {
    const baris = idx + 1;
    if (!item.kategori || !String(item.kategori).trim()) throw new Error("Kategori baris " + baris + " wajib dipilih.");
    if (!item.subKategori || !String(item.subKategori).trim()) throw new Error("Sub-kategori baris " + baris + " wajib dipilih.");
    if (!item.namaBrg || !String(item.namaBrg).trim()) throw new Error("Nama barang baris " + baris + " wajib diisi.");
    const qty = Number(item.qty);
    if (!qty || qty <= 0) throw new Error("Qty baris " + baris + " harus lebih dari 0.");
  });
}

function savePurchaseRequest(payload) {
  authGuard_();
  validatePurchaseRequest_(payload);

  const lock = acquireSaveLock_("purchase request");

  try {
    const ss = getDatabaseSpreadsheet_();
    const sh = ensurePurchaseRequestSheet_(ss);
    const prNo = allocatePRSaveIds_(ss);
    const tanggal = new Date(payload.tanggal + "T12:00:00");
    const supplier = String(payload.supplier || "").trim();
    const keterangan = String(payload.keterangan || "").trim();
    const kodeProyek = normalizeKodeProyek_(payload.kodeProyek);

    const rows = payload.items.map(function(item) {
      const harga = Number(item.harga) || 0;
      const diskon = Number(item.diskon) || 0;
      const total = (Number(item.qty) * harga) - diskon;
      return [
        tanggal,
        prNo,
        supplier,
        String(item.kategori).trim(),
        String(item.subKategori).trim(),
        String(item.namaBrg).trim(),
        Number(item.qty),
        String(item.satuan || "").trim(),
        harga,
        diskon,
        total,
        "AKTIF",
        "",
        keterangan,
        kodeProyek
      ];
    });

    writeSheetRows_(sh, rows);
    return { success: true, prNo: prNo };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function groupPurchaseRequestRows_(data, filterFn) {
  const groups = {};
  const tz = Session.getScriptTimeZone();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const prNo = String(row[1] || "").trim();
    if (!prNo) continue;
    if (filterFn && !filterFn(row)) continue;

    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (!groups[prNo]) {
      groups[prNo] = {
        prNo: prNo,
        tanggal: isNaN(d.getTime()) ? "-" : Utilities.formatDate(d, tz, "dd/MM/yyyy"),
        tanggalRaw: isNaN(d.getTime()) ? 0 : d.getTime(),
        supplier: String(row[2] || "").trim(),
        keterangan: String(row[13] || "").trim(),
        totalEstimasi: 0,
        lineCount: 0,
        status: String(row[11] || "AKTIF").trim().toUpperCase(),
        poNo: String(row[12] || "").trim(),
        kodeProyek: readRowKodeProyek_(row, PROYEK_COL_PR_)
      };
    }
    groups[prNo].totalEstimasi += Number(row[10]) || 0;
    groups[prNo].lineCount += 1;
    if (row[13] && !groups[prNo].keterangan) groups[prNo].keterangan = String(row[13]).trim();
    if (String(row[11] || "").trim().toUpperCase() === "CONVERTED") groups[prNo].status = "CONVERTED";
    if (row[12]) groups[prNo].poNo = String(row[12]).trim();
  }

  return Object.values(groups).sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
}

function getPurchaseRequestHistory(startDate, endDate) {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PURCHASE_REQUEST");
  if (!sh || sh.getLastRow() < 2) return [];

  const start = startDate ? new Date(startDate + "T00:00:00").getTime() : null;
  const end = endDate ? new Date(endDate + "T23:59:59").getTime() : null;
  const data = sh.getDataRange().getValues();

  return groupPurchaseRequestRows_(data, function(row) {
    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (isNaN(d.getTime())) return false;
    const t = d.getTime();
    if (start && t < start) return false;
    if (end && t > end) return false;
    return true;
  });
}

function getActivePurchaseRequests() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PURCHASE_REQUEST");
  if (!sh || sh.getLastRow() < 2) return [];

  const data = sh.getDataRange().getValues();
  return groupPurchaseRequestRows_(data, function(row) {
    return String(row[11] || "AKTIF").trim().toUpperCase() !== "CONVERTED";
  });
}

function getPurchaseRequestDetail(prNo) {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PURCHASE_REQUEST");
  if (!sh) throw new Error("Sheet PURCHASE_REQUEST tidak ditemukan.");

  const target = String(prNo || "").trim();
  const data = sh.getDataRange().getValues();
  const rows = data.filter(function(r, i) {
    return i > 0 && String(r[1] || "").trim() === target;
  });

  if (!rows.length) throw new Error("Purchase Request " + target + " tidak ditemukan.");

  const first = rows[0];
  const d = first[0] instanceof Date ? first[0] : new Date(first[0]);
  const items = rows.map(function(r) {
    return {
      kategori: String(r[3] || "").trim(),
      subKategori: String(r[4] || "").trim(),
      namaBrg: String(r[5] || "").trim(),
      qty: Number(r[6]) || 0,
      satuan: String(r[7] || "").trim(),
      harga: Number(r[8]) || 0,
      diskon: Number(r[9]) || 0
    };
  });

  return {
    prNo: target,
    tanggal: Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    supplier: String(first[2] || "").trim(),
    keterangan: String(first[13] || "").trim(),
    status: String(first[11] || "AKTIF").trim().toUpperCase(),
    poNo: String(first[12] || "").trim(),
    kodeProyek: readRowKodeProyek_(first, PROYEK_COL_PR_),
    items: items
  };
}

function assertPurchaseRequestConvertible_(ss, prNo) {
  const sh = ss.getSheetByName("PURCHASE_REQUEST");
  if (!sh || sh.getLastRow() < 2) {
    throw new Error("Purchase Request " + prNo + " tidak ditemukan.");
  }
  const target = String(prNo || "").trim();
  const nos = readSheetColumnValues_(sh, 2);
  const statuses = readSheetColumnValues_(sh, 12);
  const pos = readSheetColumnValues_(sh, 13);
  for (let i = 0; i < nos.length; i++) {
    if (String(nos[i][0] || "").trim() !== target) continue;
    const status = String((statuses[i] && statuses[i][0]) || "").trim().toUpperCase();
    const po = String((pos[i] && pos[i][0]) || "").trim();
    if (status === "CONVERTED") {
      throw new Error("Purchase Request " + prNo + " sudah dikonversi ke PO " + (po || "") + ".");
    }
    return;
  }
  throw new Error("Purchase Request " + prNo + " tidak ditemukan.");
}

function markPurchaseRequestConverted_(ss, prNo, poNo) {
  const sh = ss.getSheetByName("PURCHASE_REQUEST");
  if (!sh) return;
  const target = String(prNo).trim();
  const nos = readSheetColumnValues_(sh, 2);
  const rowNums = [];
  for (let i = 0; i < nos.length; i++) {
    if (String(nos[i][0] || "").trim() === target) rowNums.push(i + 2);
  }
  if (!rowNums.length) return;
  const n = rowNums.length;
  const contiguous = rowNums[n - 1] - rowNums[0] + 1 === n;
  if (contiguous) {
    const statusVals = rowNums.map(function() { return ["CONVERTED"]; });
    const poVals = rowNums.map(function() { return [poNo]; });
    sh.getRange(rowNums[0], 12, n, 1).setValues(statusVals);
    sh.getRange(rowNums[0], 13, n, 1).setValues(poVals);
  } else {
    rowNums.forEach(function(rowNum) {
      sh.getRange(rowNum, 12).setValue("CONVERTED");
      sh.getRange(rowNum, 13).setValue(poNo);
    });
  }
}
