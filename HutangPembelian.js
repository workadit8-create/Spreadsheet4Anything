// Hutang & pembelian
// ==========================================
// MODUL HUTANG (PEMBELIAN KREDIT)
// ==========================================

function getSuppliers() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  ensureMasterDataReady_(ss);
  const seen = {};
  readMasterSuppliers_(ss, true).forEach(function(s) {
    if (s.nama) seen[s.nama] = true;
  });

  const sh = ss.getSheetByName("PEMBELIAN");
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 3, sh.getLastRow(), 3).getValues().forEach(function(r) {
      const name = String(r[0] || "").trim();
      if (name) seen[name] = true;
    });
  }

  return Object.keys(seen).sort(function(a, b) { return a.localeCompare(b, "id"); });
}

function getSisaHutangPO_(ss, poNo) {
  const sh = ss.getSheetByName("PEMBELIAN");
  const data = sh.getDataRange().getValues();
  const target = String(poNo).trim();
  let sisa = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || "").trim() === target) {
      sisa += Number(data[i][12]) || 0;
    }
  }
  return sisa;
}

function getDaftarHutang(startDate, endDate, selectedSupplier) {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PEMBELIAN");
  if (!sh) throw new Error("Sheet PEMBELIAN tidak ditemukan!");

  const data = sh.getDataRange().getValues();
  const mapPO = {};
  const startObj = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
  const endObj = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

  for (let i = 1; i < data.length; i++) {
    const poNo = String(data[i][1] || "").trim();
    const supplier = String(data[i][2] || "").trim();
    const sisaTagihan = Number(data[i][12]) || 0;

    if (!poNo) continue;
    if (sisaTagihan <= 0) continue;

    if (selectedSupplier && selectedSupplier !== "all" && supplier !== selectedSupplier) continue;

    const rowDateObj = new Date(data[i][0]);
    if (isNaN(rowDateObj.getTime())) continue;

    const rowTime = rowDateObj.getTime();
    if (startObj && endObj) {
      if (rowTime < startObj || rowTime > endObj) continue;
    }

    if (!mapPO[poNo]) {
      mapPO[poNo] = {
        tanggal: Utilities.formatDate(rowDateObj, Session.getScriptTimeZone(), "yyyy-MM-dd"),
        poNo: poNo,
        supplier: supplier,
        grandTotal: 0,
        sisaTagihan: 0
      };
    }

    mapPO[poNo].grandTotal += Number(data[i][7]) || 0;
    mapPO[poNo].sisaTagihan += sisaTagihan;
  }

  const hutangList = [];
  for (let key in mapPO) {
    if (mapPO[key].sisaTagihan > 0) {
      hutangList.push(mapPO[key]);
    }
  }

  return hutangList.reverse();
}

function updatePembelianLedger(poNo, nominalBayar, tanggalBayar) {
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PEMBELIAN");
  const data = sh.getDataRange().getValues();

  const targetPO = String(poNo).trim();
  let sisaAlokasi = Number(nominalBayar);
  let rowsUpdated = 0;
  const tglBayar = tanggalBayar ? new Date(tanggalBayar) : new Date();

  for (let i = 1; i < data.length; i++) {
    const poDiSheet = String(data[i][1] || "").trim();
    if (poDiSheet !== targetPO || sisaAlokasi <= 0) continue;

    const sisaItemLama = Number(data[i][12]) || 0;
    if (sisaItemLama <= 0) continue;

    const totalItem = Number(data[i][7]) || 0;
    const bayarItemLama = Number(data[i][10]) || 0;
    const bayarUntukBarisIni = Math.min(sisaAlokasi, sisaItemLama);
    if (bayarUntukBarisIni <= 0) continue;

    const bayarItemBaru = bayarItemLama + bayarUntukBarisIni;
    const sisaItemBaru = Math.max(0, totalItem - bayarItemBaru);
    const rowNum = i + 1;

    sh.getRange(rowNum, 11).setValue(bayarItemBaru);       // K: Bayar
    sh.getRange(rowNum, 13).setValue(sisaItemBaru);       // M: Sisa Tagihan

    if (sisaItemBaru <= 0) {
      sh.getRange(rowNum, 14).setValue(tglBayar);         // N: Tanggal Bayar
      sh.getRange(rowNum, 9).setValue("Tunai");           // I: Metode (lunas)
    }

    sisaAlokasi -= bayarUntukBarisIni;
    rowsUpdated++;
  }

  if (rowsUpdated === 0) {
    throw new Error("Tidak ada baris hutang aktif untuk PO " + targetPO + ".");
  }

  if (sisaAlokasi > 0.01) {
    throw new Error(
      "Alokasi pelunasan gagal. Nominal " + sisaAlokasi + " tidak dapat dialokasikan ke baris PO."
    );
  }
}

function simpanPelunasanHutangWeb(payload) {
  authGuard_();
  const lock = acquireSaveLock_("pelunasan hutang");

  try {
    const ss = getDatabaseSpreadsheet_();
    const sisaHutang = getSisaHutangPO_(ss, payload.po);
    validatePelunasanHutangPayload_(payload, sisaHutang);

    const sh = ss.getSheetByName("PELUNASAN_UTANG");
    if (!sh) throw new Error("Sheet PELUNASAN_UTANG tidak ditemukan!");

    let fileUrl = "";
    if (payload.fileBase64) {
      const folder = getUploadFolder_();
      const blob = Utilities.newBlob(
        Utilities.base64Decode(payload.fileBase64),
        payload.fileMimeType,
        payload.fileName
      );
      fileUrl = folder.createFile(blob).getUrl();
    }

    sh.appendRow([
      new Date(payload.tanggal),       // A: Tanggal
      payload.po,                      // B: No PO
      payload.supplier,                // C: Supplier
      payload.nominal,                 // D: Nominal
      payload.rekening || "",          // E: Metode / Rekening
      payload.keterangan,              // F: Keterangan
      false,                           // G: POSTED
      "TX-PU-" + new Date().getTime(), // H: TransID
      "POST",                          // I: Aksi
      payload.rekening,                // J: Rekening
      fileUrl                          // K: Bukti Bayar
    ]);

    updatePembelianLedger(payload.po, payload.nominal, payload.tanggal);

    const shMutasi = ss.getSheetByName("MUTASI_DANA");
    shMutasi.appendRow([
      new Date(payload.tanggal),
      "Keluar",
      "",
      payload.rekening,
      payload.supplier,
      payload.nominal,
      "Pelunasan " + payload.po,
      false,
      "TX-PU-MB-" + new Date().getTime()
    ]);

    return { success: true };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function simpanPelunasanPiutangWeb(payload) {
  authGuard_();
  const lock = acquireSaveLock_("pelunasan piutang");

  try {
    const ss = getDatabaseSpreadsheet_();
    const sisaPiutang = getSisaPiutangInvoice_(ss, payload.invoice);
    validatePelunasanPayload_(payload, sisaPiutang);

    const sh = ss.getSheetByName("PELUNASAN_PIUTANG");
    
    // 1. Upload File ke Drive (jika ada)
    let fileUrl = "";
    if (payload.fileBase64) {
      const folder = getUploadFolder_();
      const blob = Utilities.newBlob(Utilities.base64Decode(payload.fileBase64), payload.fileMimeType, payload.fileName);
      fileUrl = folder.createFile(blob).getUrl();
    }

    // 2. Simpan ke Sheet Pelunasan (Padding array disesuaikan dengan kolom J & K)
    sh.appendRow([
      new Date(payload.tanggal),      // A: Tanggal
      payload.invoice,                // B: No Invoice
      payload.customer,               // C: Customer
      payload.nominal,                // D: Nominal
      payload.rekening || "",         // E: Metode / Rekening (untuk script posting)
      payload.keterangan,             // F: Keterangan
      false,                          // G: POSTED
      "TX-PI-" + new Date().getTime(),// H: TransID
      "POST",                         // I: Aksi
      payload.rekening,               // J: Rekening
      fileUrl                         // K: Bukti Bayar
    ]);

    // 3. PENTING: Update Otomatis Sheet PEMASUKAN
    updatePemasukanLedger(payload.invoice, payload.nominal, payload.tanggal);

    // 4. Otomatis Update Mutasi
    const shMutasi = ss.getSheetByName("MUTASI_DANA");
    shMutasi.appendRow([
      new Date(payload.tanggal),
      "Masuk",
      "",
      "Customer: " + payload.customer,
      payload.rekening,
      payload.nominal,
      "Pelunasan " + payload.invoice,
      false,
      "TX-BAYAR-" + new Date().getTime()
    ]);
    
    return { success: true };
  } catch(err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}
