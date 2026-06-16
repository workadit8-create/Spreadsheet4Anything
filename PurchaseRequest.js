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
      "PO No", "Keterangan"
    ]);
  }
  return sh;
}

function nextPRNumber_() {
  return nextDocNumber_("PR", "PR_SEQ_DATE", "PR_SEQ_NUM", "PURCHASE_REQUEST", 1);
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

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = SpreadsheetApp.openById(DATABASE_ID);
    const sh = ensurePurchaseRequestSheet_(ss);
    const prNo = nextPRNumber_();
    const tanggal = new Date(payload.tanggal + "T12:00:00");
    const supplier = String(payload.supplier || "").trim();
    const keterangan = String(payload.keterangan || "").trim();

    payload.items.forEach(function(item, index) {
      const harga = Number(item.harga) || 0;
      const diskon = Number(item.diskon) || 0;
      const total = (Number(item.qty) * harga) - diskon;
      sh.appendRow([
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
        keterangan
      ]);
    });

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
        poNo: String(row[12] || "").trim()
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
  const ss = SpreadsheetApp.openById(DATABASE_ID);
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
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const sh = ss.getSheetByName("PURCHASE_REQUEST");
  if (!sh || sh.getLastRow() < 2) return [];

  const data = sh.getDataRange().getValues();
  return groupPurchaseRequestRows_(data, function(row) {
    return String(row[11] || "AKTIF").trim().toUpperCase() !== "CONVERTED";
  });
}

function getPurchaseRequestDetail(prNo) {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
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
    items: items
  };
}

function assertPurchaseRequestConvertible_(ss, prNo) {
  const detail = getPurchaseRequestDetail(prNo);
  if (detail.status === "CONVERTED") {
    throw new Error("Purchase Request " + prNo + " sudah dikonversi ke PO " + (detail.poNo || "") + ".");
  }
}

function markPurchaseRequestConverted_(ss, prNo, poNo) {
  const sh = ss.getSheetByName("PURCHASE_REQUEST");
  if (!sh) return;
  const target = String(prNo).trim();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || "").trim() === target) {
      sh.getRange(i + 1, 12).setValue("CONVERTED");
      sh.getRange(i + 1, 13).setValue(poNo);
    }
  }
}
