// Kas & Bank / mutasi dana
// ==========================================
// MODUL KAS & BANK (MUTASI DANA)
// ==========================================

function getSaldoKasBank() {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const sh = ss.getSheetByName("MUTASI_DANA");
  const data = sh && sh.getLastRow() >= 2 ? sh.getDataRange().getValues() : [];
  const daftarAkun = getListKasBank();

  const saldo = {};
  daftarAkun.forEach(function(akun) { saldo[akun.nama] = 0; });

  for (let i = 1; i < data.length; i++) {
    const nominal = Number(data[i][5]) || 0;
    const dari = data[i][3];
    const ke = data[i][4];
    if (saldo.hasOwnProperty(dari)) saldo[dari] -= nominal;
    if (saldo.hasOwnProperty(ke)) saldo[ke] += nominal;
  }
  return saldo;
}
function saveMutasiDana(p) {
  authGuard_();
  const lock = acquireSaveLock_("mutasi");

  try {
    validateMutasiDana_(p);

    const ss = getDatabaseSpreadsheet_();
    const sh = ss.getSheetByName("MUTASI_DANA");
    if (!sh) throw new Error("Sheet MUTASI_DANA belum dibuat!");

    const lastRow = sh.getLastRow();
    const transNo = Math.max(1, lastRow);
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
    const transId = "TX-MB-" + dateStr + "-" + transNo;

    sh.appendRow([
      new Date(p.tanggal),
      p.jenis,
      "",
      p.sumber,
      p.tujuan,
      Number(p.nominal),
      p.keterangan,
      false,
      transId,
      "POST"
    ]);

    return { success: true, transId: transId };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function getHistoryMutasi() {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const sh = ss.getSheetByName('MUTASI_DANA');
  const data = sh.getDataRange().getValues();
  const history = [];
  
  for (let i = data.length - 1; i >= 1; i--) {
    history.push({
      tanggal: Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), "dd/MM/yyyy"),
      jenis: data[i][1],
      sumber: data[i][3],
      tujuan: data[i][4],
      nominal: data[i][5],
      posted: data[i][7],
      transId: data[i][8]
    });
  }
  return history;
}

function pancingIzinDrive() {
  const folder = getUploadFolder_();
  Logger.log("Folder berhasil diakses: " + folder.getName());
}

function updatePemasukanLedger(invoiceNo, nominalBayar, tanggalBayar) {
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();

  const targetInv = String(invoiceNo).trim();
  let sisaAlokasi = Number(nominalBayar);
  let rowsUpdated = 0;
  const tglBayar = tanggalBayar ? new Date(tanggalBayar) : new Date();

  for (let i = 1; i < data.length; i++) {
    let invDiSheet = String(data[i][4] || "").trim();

    if (invDiSheet !== targetInv || sisaAlokasi <= 0) continue;

    let kurangBayarItemLama = Number(data[i][13]) || 0;
    if (kurangBayarItemLama <= 0) continue;

    let totalItem = Number(data[i][11]) || 0;
    let bayarItemLama = Number(data[i][12]) || 0;
    let bayarUntukBarisIni = Math.min(sisaAlokasi, kurangBayarItemLama);

    if (bayarUntukBarisIni <= 0) continue;

    let bayarItemBaru = bayarItemLama + bayarUntukBarisIni;
    let kurangBayarItemBaru = Math.max(0, totalItem - bayarItemBaru);
    let rowNum = i + 1;

    // Kolom M (Bayar) & N (Kurang Bayar)
    sh.getRange(rowNum, 13).setValue(bayarItemBaru);
    sh.getRange(rowNum, 14).setValue(kurangBayarItemBaru);

    // Kolom O (Status) & P (Tanggal Bayar) — lunas per baris
    if (kurangBayarItemBaru <= 0) {
      sh.getRange(rowNum, 15).setValue("PENJUALAN TUNAI");
      sh.getRange(rowNum, 16).setValue(tglBayar);
    }

    sisaAlokasi -= bayarUntukBarisIni;
    rowsUpdated++;
  }

  if (rowsUpdated === 0) {
    throw new Error("Tidak ada baris piutang aktif untuk invoice " + targetInv + ".");
  }

  if (sisaAlokasi > 0.01) {
    throw new Error(
      "Alokasi pelunasan gagal. Nominal " + sisaAlokasi + " tidak dapat dialokasikan ke baris invoice."
    );
  }
}

function debugCariInvoice(invoiceToFind) {
  const ss = SpreadsheetApp.openById(DATABASE_ID); // Pastikan ID ini sudah benar
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();
  
  console.log("Mencari invoice: '" + invoiceToFind + "'");
  
  for(let i = 0; i < data.length; i++) {
    let invDiSheet = String(data[i][4]); // Kolom E
    
    // Ini akan menampilkan apa yang dilihat skrip
    console.log("Baris " + (i+1) + " berisi: '" + invDiSheet + "'");
    
    if(invDiSheet.trim() == String(invoiceToFind).trim()) {
      console.log(">>> DITEMUKAN DI BARIS " + (i+1));
      return;
    }
  }
  console.log(">>> TIDAK DITEMUKAN");
}

// Fungsi untuk mengambil list Kategori dan Sub-Kategori dari Master
function getMasterDataPembelian() {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  return buildMasterPembelianMap_(ss);
}

let KATEGORI_ACCOUNT_MAP_ = null;

function buildKategoriAccountMap_(ss) {
  if (KATEGORI_ACCOUNT_MAP_) return KATEGORI_ACCOUNT_MAP_;
  KATEGORI_ACCOUNT_MAP_ = {};
  readMasterKategoriPembelian_(ss, true).forEach(function(row) {
    KATEGORI_ACCOUNT_MAP_[row.kategori + "|" + row.subKategori] = row.akun;
  });
  return KATEGORI_ACCOUNT_MAP_;
}

function getAccountByKategoriFast_(kategori, subKategori, ss) {
  const map = buildKategoriAccountMap_(ss);
  const key = String(kategori || "").trim() + "|" + String(subKategori || "").trim();
  return map[key] || "BIAYA LAIN-LAIN";
}

function savePembelian(p) {
  authGuard_();
  validatePembelian_(p);

  const lock = acquireSaveLock_("pembelian");

  try {
    const ss = getDatabaseSpreadsheet_();
    if (p.prNo) {
      assertPurchaseRequestConvertible_(ss, p.prNo);
    }
    const sh = ss.getSheetByName("PEMBELIAN");
    const shMutasi = ss.getSheetByName("MUTASI_DANA");

    let fileUrl = "";
    if (p.fileBase64) {
      fileUrl = uploadToDrive(p.fileBase64, p.fileName, p.fileMimeType);
    }

    const dateStr = new Date(p.tanggal).toISOString().split("T")[0].replace(/-/g, "").substring(2);
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    const poNumber = "PO-" + dateStr + "-" + randomNum;
    const tgl = new Date(p.tanggal);
    let sisaBayar = Number(p.bayar);

    const pembelianRows = [];
    const mutasiRows = [];

    p.items.forEach(function(item, index) {
      const akunFromClient = String(item.akun || "").trim();
      const akun = akunFromClient || getAccountByKategoriFast_(item.kategori, item.subKategori, ss);
      const trxId = "TRX-PB-" + dateStr + "-" + randomNum + "-" + (index + 1);
      const totalBaris = (item.qty * item.harga) - item.diskon;
      const bayarItem = Math.min(sisaBayar, totalBaris);
      sisaBayar -= bayarItem;
      const sisaTagihan = totalBaris - bayarItem;
      const metodeBaris = sisaTagihan > 0 ? "Kredit" : "Tunai";
      const tanggalBayar = bayarItem > 0 ? tgl : "";
      const rekening = bayarItem > 0 ? p.rekening : "";

      pembelianRows.push([
        tgl,
        poNumber,
        p.supplier,
        item.namaBrg,
        item.qty,
        item.satuan,
        item.harga,
        totalBaris,
        metodeBaris,
        akun,
        bayarItem,
        false,
        sisaTagihan,
        tanggalBayar,
        rekening,
        trxId,
        "POST",
        fileUrl
      ]);

      if (bayarItem > 0 && p.rekening && shMutasi) {
        mutasiRows.push([
          tgl, "Keluar", "Pembelian", p.rekening, p.supplier,
          bayarItem, "Pembelian " + item.namaBrg, false, trxId
        ]);
      }
    });

    writeSheetRows_(sh, pembelianRows);
    if (mutasiRows.length && shMutasi) {
      writeSheetRows_(shMutasi, mutasiRows);
    }

    if (p.prNo) {
      markPurchaseRequestConverted_(ss, p.prNo, poNumber);
    }

    return { success: true, po: poNumber };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function getAccountByKategori(kategori, subKategori) {
  const ss = getDatabaseSpreadsheet_();
  return getAccountByKategoriFast_(kategori, subKategori, ss);
}

// 2. Generator Nomor "Keren"
function generatePurchaseIDs() {
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyMMdd");
  const randomNum = Math.floor(Math.random() * 9000) + 1000; // Random 4 digit
  return {
    po: "PO-" + dateStr + "-" + randomNum,
    trx: "TRX-PB-" + dateStr + "-" + randomNum
  };
}

function uploadToDrive(base64Data, fileName, mimeType) {
  const folder = getUploadFolder_();
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  const file = folder.createFile(blob);
  return file.getUrl();
}

// Mengambil list PO
function getPurchaseOrderHistory(start, end) {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const sh = ss.getSheetByName("PEMBELIAN");
  if (!sh) throw new Error("Sheet PEMBELIAN tidak ditemukan!");

  const data = sh.getDataRange().getValues();
  data.shift(); // Hapus header
  
  let poMap = {};
  
  // Ubah tanggal filter ke timestamp (angka) agar perbandingan akurat
  let startTime = new Date(start).setHours(0,0,0,0);
  let endTime = new Date(end).setHours(23,59,59,999);
  
  data.forEach(row => {
    // Memastikan baris tidak kosong
    if (!row[1]) return; 
    
    // Ambil tanggal dari kolom A (row[0])
    let tgl = new Date(row[0]).getTime();
    
    // Cek apakah tanggal valid
    if (isNaN(tgl)) return;
    if (tgl >= startTime && tgl <= endTime) {
      let poNum = row[1]; // No Dokumen (Kolom B)
      if (!poMap[poNum]) {
        poMap[poNum] = { 
          tanggal: row[0], 
          po: poNum, 
          supplier: row[2], // Kolom C
          total: 0,
          bayar: 0,
          sisa: 0 
        };
      }
      poMap[poNum].total += Number(row[7]) || 0; // Kolom H (Total)
      poMap[poNum].bayar += Number(row[10]) || 0; // Kolom K (Bayar)
      poMap[poNum].sisa += Number(row[12]) || 0; // Kolom M (Sisa Tagihan)
    }
  });
  
  return Object.values(poMap)
    .sort(function(a, b) { return new Date(b.tanggal) - new Date(a.tanggal); })
    .map(function(row) {
      return {
        tanggal: Utilities.formatDate(new Date(row.tanggal), Session.getScriptTimeZone(), "dd/MM/yyyy"),
        po: row.po,
        supplier: row.supplier,
        total: row.total,
        bayar: row.bayar,
        sisa: row.sisa
      };
    });
}

function getPurchaseOrderDetailsExport(startDate, endDate) {
  authGuard_();
  try {
    const ss = SpreadsheetApp.openById(DATABASE_ID);
    const sh = ss.getSheetByName("PEMBELIAN");
    if (!sh) throw new Error("Sheet PEMBELIAN tidak ditemukan!");

    const data = sh.getDataRange().getValues();
    const startObj = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
    const endObj = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;
    const result = [];

    for (let i = 1; i < data.length; i++) {
      const poNum = String(data[i][1] || "").trim();
      if (!poNum) continue;

      const rowDateObj = new Date(data[i][0]);
      if (isNaN(rowDateObj.getTime())) continue;

      const rowTime = rowDateObj.getTime();
      if (startObj && endObj) {
        if (rowTime < startObj || rowTime > endObj) continue;
      }

      result.push({
        "Tanggal": Utilities.formatDate(rowDateObj, Session.getScriptTimeZone(), "dd/MM/yyyy"),
        "No PO": poNum,
        "Supplier": String(data[i][2] || ""),
        "Barang": String(data[i][3] || ""),
        "Qty": Number(data[i][4]) || 0,
        "Satuan": String(data[i][5] || ""),
        "Harga Satuan": Number(data[i][6]) || 0,
        "Total": Number(data[i][7]) || 0,
        "Metode": String(data[i][8] || ""),
        "Akun": String(data[i][9] || ""),
        "Sudah Dibayar": Number(data[i][10]) || 0,
        "Sisa Tagihan": Number(data[i][12]) || 0
      });
    }
    return result.reverse();
  } catch (e) {
    console.error(e);
    return [];
  }
}

function getPurchaseOrderDetail(poNum) {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const sh = ss.getSheetByName("PEMBELIAN");
  if (!sh) throw new Error("Sheet PEMBELIAN tidak ditemukan!");

  const data = sh.getDataRange().getValues();
  const target = String(poNum).trim();
  const items = [];
  let header = null;
  let totalBayar = 0;
  let sisaTagihan = 0;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || "").trim() !== target) continue;

    if (!header) {
      header = {
        po: target,
        tanggal: Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), "dd/MM/yyyy"),
        supplier: String(data[i][2] || ""),
        metode: String(data[i][8] || ""),
        rekening: String(data[i][14] || "")
      };
    }

    totalBayar += Number(data[i][10]) || 0;
    sisaTagihan += Number(data[i][12]) || 0;

    items.push({
      barang: String(data[i][3] || ""),
      qty: Number(data[i][4]) || 0,
      satuan: String(data[i][5] || ""),
      harga: Number(data[i][6]) || 0,
      total: Number(data[i][7]) || 0,
      akun: String(data[i][9] || "")
    });
  }

  if (!header) {
    throw new Error("PO " + target + " tidak ditemukan.");
  }

  let grandTotal = 0;
  items.forEach(function(it) { grandTotal += it.total; });

  return {
    po: header.po,
    tanggal: header.tanggal,
    supplier: header.supplier,
    metode: header.metode,
    rekening: header.rekening,
    grandTotal: grandTotal,
    totalBayar: totalBayar,
    sisaTagihan: sisaTagihan,
    items: items
  };
}

// Mengambil data untuk Edit (Mirip logic invoice)
function getPurchaseOrderForEdit(poNum) {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const sh = ss.getSheetByName("PEMBELIAN");
  const data = sh.getDataRange().getValues();
  data.shift();
  const rows = data.filter(r => r[1] == poNum);
  
  return {
    tanggal: rows[0][0],
    supplier: rows[0][2],
    metode: rows[0][8],
    bayar: rows[0][10], // Ambil bayar dari baris pertama
    items: rows.map(r => ({ 
      kategori: "", subKategori: "", namaBrg: r[3], qty: r[4], 
      satuan: r[5], harga: r[6], diskon: 0 
    }))
  };
}
