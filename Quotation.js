// Quotation
// ==========================================
// QUOTATION
// ==========================================

function ensureQuotationSheet_(ss) {
  let sh = ss.getSheetByName("QUOTATION");
  if (!sh) {
    sh = ss.insertSheet("QUOTATION");
    sh.appendRow([
      "Tanggal", "No Quotation", "Customer", "Produk", "Qty", "Satuan",
      "Harga", "Diskon", "Total", "Status", "Line ID", "Invoice No", "Keterangan"
    ]);
  }
  return sh;
}

function scanMaxDocSeqForDate_(sheetName, colIndex, prefix, dateStr, ss) {
  const spreadsheet = ss || getDatabaseSpreadsheet_();
  const sh = spreadsheet.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return 0;
  const data = sh.getDataRange().getValues();
  let max = 0;
  const fullPrefix = prefix + "-" + dateStr + "-";
  for (let i = 1; i < data.length; i++) {
    const raw = String(data[i][colIndex] || "").trim().toUpperCase();
    if (!raw.startsWith(fullPrefix)) continue;
    const m = raw.match(new RegExp("^" + prefix + "-\\d{8}-(\\d+)$", "i"));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function nextDocNumber_(prefix, dateKey, seqKey, sheetName, colIndex, ss) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  let storedDate = String(getSettingValue_(dateKey) || "").trim();
  let seq = Number(getSettingValue_(seqKey));

  if (!storedDate || isNaN(seq)) {
    seq = scanMaxDocSeqForDate_(sheetName, colIndex, prefix, today, ss);
    storedDate = today;
  } else if (storedDate !== today) {
    seq = scanMaxDocSeqForDate_(sheetName, colIndex, prefix, today, ss);
    storedDate = today;
  }

  seq += 1;
  setSettingValues_([
    [dateKey, today],
    [seqKey, seq]
  ]);
  return prefix + "-" + today + "-" + String(seq).padStart(4, "0");
}

function nextQuotationNumber_(ss) {
  return nextDocNumber_("QT", "QT_SEQ_DATE", "QT_SEQ_NUM", "QUOTATION", 1, ss);
}

function allocateQuotationSaveIds_(lineCount, ss) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const dateKey = "QT_SEQ_DATE";
  const seqKey = "QT_SEQ_NUM";
  const lineKey = "QT_LINE_SEQ";

  let storedDate = String(getSettingValue_(dateKey) || "").trim();
  let qtSeq = Number(getSettingValue_(seqKey));
  if (!storedDate || isNaN(qtSeq)) {
    qtSeq = scanMaxDocSeqForDate_("QUOTATION", 1, "QT", today, ss);
    storedDate = today;
  } else if (storedDate !== today) {
    qtSeq = scanMaxDocSeqForDate_("QUOTATION", 1, "QT", today, ss);
    storedDate = today;
  }
  qtSeq += 1;

  let lineSeq = Number(getSettingValue_(lineKey));
  if (getSettingValue_(lineKey) === null || isNaN(lineSeq)) lineSeq = 0;

  const lineIds = [];
  for (let i = 0; i < lineCount; i++) {
    lineSeq += 1;
    lineIds.push("QT-L-" + String(lineSeq).padStart(6, "0"));
  }

  setSettingValues_([
    [dateKey, today],
    [seqKey, qtSeq],
    [lineKey, lineSeq]
  ]);

  return {
    quotationNo: "QT-" + today + "-" + String(qtSeq).padStart(4, "0"),
    lineIds: lineIds
  };
}

function validateQuotation_(p) {
  if (!p.tanggal) throw new Error("Tanggal quotation wajib diisi.");
  if (!p.customer || !String(p.customer).trim()) throw new Error("Customer wajib dipilih.");
  if (!p.products || !p.products.length) throw new Error("Minimal harus ada 1 produk.");

  p.products.forEach(function(item, idx) {
    const baris = idx + 1;
    if (!item.produk || !String(item.produk).trim()) throw new Error("Produk baris " + baris + " wajib dipilih.");
    const qty = Number(item.qty);
    if (!qty || qty <= 0) throw new Error("Qty baris " + baris + " harus lebih dari 0.");
    const harga = Number(item.harga);
    if (isNaN(harga) || harga < 0) throw new Error("Harga baris " + baris + " tidak valid.");
  });
}

function saveQuotation(payload) {
  authGuard_();
  validateQuotation_(payload);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getDatabaseSpreadsheet_();
    const sh = ensureQuotationSheet_(ss);
    const ids = allocateQuotationSaveIds_(payload.products.length, ss);
    const tanggal = new Date(payload.tanggal + "T12:00:00");
    const keterangan = String(payload.keterangan || "").trim();
    const customer = String(payload.customer).trim();

    const rows = payload.products.map(function(item, index) {
      const total = (Number(item.qty) * Number(item.harga)) - (Number(item.diskon) || 0);
      return [
        tanggal,
        ids.quotationNo,
        customer,
        String(item.produk).trim(),
        Number(item.qty),
        String(item.satuan || "").trim(),
        Number(item.harga),
        Number(item.diskon) || 0,
        total,
        "AKTIF",
        ids.lineIds[index],
        "",
        keterangan
      ];
    });

    writeSheetRows_(sh, rows);
    return { success: true, quotationNo: ids.quotationNo };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function groupQuotationRows_(data, filterFn) {
  const groups = {};
  const tz = Session.getScriptTimeZone();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const qtNo = String(row[1] || "").trim();
    if (!qtNo) continue;
    if (filterFn && !filterFn(row)) continue;

    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (!groups[qtNo]) {
      groups[qtNo] = {
        quotationNo: qtNo,
        tanggal: isNaN(d.getTime()) ? "-" : Utilities.formatDate(d, tz, "dd/MM/yyyy"),
        tanggalRaw: isNaN(d.getTime()) ? 0 : d.getTime(),
        customer: String(row[2] || "").trim(),
        keterangan: String(row[12] || "").trim(),
        total: 0,
        lineCount: 0,
        status: String(row[9] || "AKTIF").trim().toUpperCase(),
        invoiceNo: String(row[11] || "").trim()
      };
    }
    groups[qtNo].total += Number(row[8]) || 0;
    groups[qtNo].lineCount += 1;
    if (row[12] && !groups[qtNo].keterangan) groups[qtNo].keterangan = String(row[12]).trim();
    if (String(row[9] || "").trim().toUpperCase() === "CONVERTED") groups[qtNo].status = "CONVERTED";
    if (row[11]) groups[qtNo].invoiceNo = String(row[11]).trim();
  }

  return Object.values(groups).sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
}

function getQuotationHistory(startDate, endDate) {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("QUOTATION");
  if (!sh || sh.getLastRow() < 2) return [];

  const start = startDate ? new Date(startDate + "T00:00:00").getTime() : null;
  const end = endDate ? new Date(endDate + "T23:59:59").getTime() : null;
  const data = sh.getDataRange().getValues();

  return groupQuotationRows_(data, function(row) {
    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (isNaN(d.getTime())) return false;
    const t = d.getTime();
    if (start && t < start) return false;
    if (end && t > end) return false;
    return true;
  });
}

function getActiveQuotations() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("QUOTATION");
  if (!sh || sh.getLastRow() < 2) return [];

  const data = sh.getDataRange().getValues();
  return groupQuotationRows_(data, function(row) {
    return String(row[9] || "AKTIF").trim().toUpperCase() !== "CONVERTED";
  });
}

function getQuotationDetail(quotationNo) {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("QUOTATION");
  if (!sh) throw new Error("Sheet QUOTATION tidak ditemukan.");

  const target = String(quotationNo || "").trim();
  const data = sh.getDataRange().getValues();
  const rows = data.filter(function(r, i) {
    return i > 0 && String(r[1] || "").trim() === target;
  });

  if (!rows.length) throw new Error("Quotation " + target + " tidak ditemukan.");

  const first = rows[0];
  const d = first[0] instanceof Date ? first[0] : new Date(first[0]);
  const products = rows.map(function(r) {
    return {
      produk: String(r[3] || "").trim(),
      qty: Number(r[4]) || 0,
      satuan: String(r[5] || "").trim(),
      harga: Number(r[6]) || 0,
      diskon: Number(r[7]) || 0
    };
  });

  return {
    quotationNo: target,
    tanggal: Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    customer: String(first[2] || "").trim(),
    keterangan: String(first[12] || "").trim(),
    status: String(first[9] || "AKTIF").trim().toUpperCase(),
    invoiceNo: String(first[11] || "").trim(),
    products: products
  };
}

function assertQuotationConvertible_(ss, quotationNo) {
  const detail = getQuotationDetail(quotationNo);
  if (detail.status === "CONVERTED") {
    throw new Error("Quotation " + quotationNo + " sudah dikonversi ke invoice " + (detail.invoiceNo || "") + ".");
  }
}

function markQuotationConverted_(ss, quotationNo, invoiceNo) {
  const sh = ss.getSheetByName("QUOTATION");
  if (!sh) return;
  const target = String(quotationNo).trim();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || "").trim() === target) {
      sh.getRange(i + 1, 10).setValue("CONVERTED");
      sh.getRange(i + 1, 12).setValue(invoiceNo);
    }
  }
}
