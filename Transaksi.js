// Settings, invoice, piutang, generator nomor
// ==========================================
// GENERATOR NOMOR INVOICE & TRANSACTION ID
// Counter disimpan di sheet SETTING (bukan lastRow)
// ==========================================

function getSettingValue_(key) {
  const k = String(key || "").trim();
  if (!k) return null;
  const cache = loadSettingsCache_();
  if (cache[k] === undefined) return null;
  return cache[k];
}

function setSettingValue_(key, value) {
  const k = String(key || "").trim();
  if (!k) throw new Error("Key setting kosong.");
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("SETTING");
  if (!sh) throw new Error("Sheet SETTING tidak ditemukan!");
  const rowMap = loadSettingsRowMap_(sh);
  if (rowMap[k]) {
    sh.getRange(rowMap[k], 2).setValue(value);
  } else {
    sh.appendRow([k, value]);
    rowMap[k] = sh.getLastRow();
  }
  if (!SETTINGS_CACHE_) loadSettingsCache_();
  SETTINGS_CACHE_[k] = value;
}

/** Satu baca sheet SETTING, banyak update — untuk save invoice / transaksi. */
function setSettingValues_(pairs) {
  if (!pairs || !pairs.length) return;
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("SETTING");
  if (!sh) throw new Error("Sheet SETTING tidak ditemukan!");
  const rowMap = loadSettingsRowMap_(sh);
  pairs.forEach(function(pair) {
    const k = String(pair[0] || "").trim();
    if (!k) return;
    const v = pair[1];
    if (rowMap[k]) {
      sh.getRange(rowMap[k], 2).setValue(v);
    } else {
      sh.appendRow([k, v]);
      rowMap[k] = sh.getLastRow();
    }
    if (!SETTINGS_CACHE_) loadSettingsCache_();
    SETTINGS_CACHE_[k] = v;
  });
}

function scanMaxTransactionSeqFromSheet_() {
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PEMASUKAN");
  if (!sh || sh.getLastRow() < 2) return 0;
  const data = sh.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const raw = String(data[i][18] || "").trim();
    const m = raw.match(/^TC-J-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function scanMaxInvoiceSeqForDate_(dateStr) {
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PEMASUKAN");
  if (!sh || sh.getLastRow() < 2) return 0;
  const data = sh.getDataRange().getValues();
  let max = 0;
  const prefix = "INV-" + dateStr + "-";
  for (let i = 1; i < data.length; i++) {
    const raw = String(data[i][4] || "").trim().toUpperCase();
    if (!raw.startsWith(prefix)) continue;
    const m = raw.match(/^INV-\d{8}-(\d+)-TC$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function nextInvoiceNumber_() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const dateKey = "INVOICE_SEQ_DATE";
  const seqKey = "INVOICE_SEQ_NUM";

  let storedDate = String(getSettingValue_(dateKey) || "").trim();
  let seq = Number(getSettingValue_(seqKey));

  if (!storedDate || isNaN(seq)) {
    seq = scanMaxInvoiceSeqForDate_(today);
    storedDate = today;
  } else if (storedDate !== today) {
    seq = scanMaxInvoiceSeqForDate_(today);
    storedDate = today;
  }

  seq += 1;
  setSettingValue_(dateKey, today);
  setSettingValue_(seqKey, seq);

  return "INV-" + today + "-" + String(seq).padStart(4, "0") + "-TC";
}

function allocateTransactionIds_(count) {
  const seqKey = "TRANSACTION_SEQ";
  let seq = Number(getSettingValue_(seqKey));
  const settingEmpty = getSettingValue_(seqKey) === null || getSettingValue_(seqKey) === "";

  if (settingEmpty || isNaN(seq)) {
    seq = scanMaxTransactionSeqFromSheet_();
  }

  const ids = [];
  for (let i = 0; i < count; i++) {
    seq += 1;
    ids.push("TC-J-" + String(seq).padStart(6, "0"));
  }
  setSettingValue_(seqKey, seq);
  return ids;
}

/** Invoice no + transaction IDs + update counter SETTING dalam satu pass. */
function allocateInvoiceSaveIds_(productCount) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const dateKey = "INVOICE_SEQ_DATE";
  const seqKey = "INVOICE_SEQ_NUM";
  const txnKey = "TRANSACTION_SEQ";

  let storedDate = String(getSettingValue_(dateKey) || "").trim();
  let invSeq = Number(getSettingValue_(seqKey));
  if (!storedDate || isNaN(invSeq)) {
    invSeq = scanMaxInvoiceSeqForDate_(today);
    storedDate = today;
  } else if (storedDate !== today) {
    invSeq = scanMaxInvoiceSeqForDate_(today);
    storedDate = today;
  }
  invSeq += 1;

  let txnSeq = Number(getSettingValue_(txnKey));
  const txnEmpty = getSettingValue_(txnKey) === null || getSettingValue_(txnKey) === "";
  if (txnEmpty || isNaN(txnSeq)) {
    txnSeq = scanMaxTransactionSeqFromSheet_();
  }

  const transactionIds = [];
  for (let i = 0; i < productCount; i++) {
    txnSeq += 1;
    transactionIds.push("TC-J-" + String(txnSeq).padStart(6, "0"));
  }

  setSettingValues_([
    [dateKey, today],
    [seqKey, invSeq],
    [txnKey, txnSeq]
  ]);

  return {
    invoiceNo: "INV-" + today + "-" + String(invSeq).padStart(4, "0") + "-TC",
    transactionIds: transactionIds
  };
}

let PRODUCT_ACCOUNT_MAP_ = null;

function buildProductAccountMap_(ss) {
  if (PRODUCT_ACCOUNT_MAP_) return PRODUCT_ACCOUNT_MAP_;
  PRODUCT_ACCOUNT_MAP_ = {};
  readMasterProduk_(ss, true).forEach(function(p) {
    PRODUCT_ACCOUNT_MAP_[p.nama] = p.akun || "PENDAPATAN";
  });
  return PRODUCT_ACCOUNT_MAP_;
}

function getProductAccountFast_(productName, ss) {
  const map = buildProductAccountMap_(ss);
  const n = String(productName || "").trim();
  return map[n] || "PENDAPATAN";
}

function saveInvoice(invoiceData){
  authGuard_();
  validateInvoiceData_(invoiceData);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getDatabaseSpreadsheet_();
    if (invoiceData.quotationNo) {
      assertQuotationConvertible_(ss, invoiceData.quotationNo);
    }
    const ids = allocateInvoiceSaveIds_(invoiceData.products.length);
    const result = persistInvoice_(invoiceData, ids.invoiceNo, ss, {
      mutasiNominal: invoiceData.bayar,
      transactionIds: ids.transactionIds
    });
    if (invoiceData.quotationNo) {
      markQuotationConverted_(ss, invoiceData.quotationNo, ids.invoiceNo);
    }
    return result;
  } catch(err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function persistInvoice_(invoiceData, invoiceNo, ss, options) {
  options = options || {};
  const mutasiNominal = options.mutasiNominal !== undefined ? Number(options.mutasiNominal) : Number(invoiceData.bayar) || 0;

  const sh = ss.getSheetByName("PEMASUKAN");
  const transactionIds = options.transactionIds || allocateTransactionIds_(invoiceData.products.length);
  const tz = Session.getScriptTimeZone();
  const tanggal = new Date(invoiceData.tanggal);
  const bulan = Utilities.formatDate(tanggal, tz, "MMMM");
  const tahun = Utilities.formatDate(tanggal, tz, "yyyy");
  let sisaBayar = invoiceData.bayar;

  let fileUrl = "";
  if (invoiceData.fileBase64) {
    const folderId = "1fQSokPZUT_FdqNwXunH8s_0b5ZcrAC7E";
    const folder = DriveApp.getFolderById(folderId);
    const blob = Utilities.newBlob(Utilities.base64Decode(invoiceData.fileBase64), invoiceData.fileMimeType, invoiceData.fileName);
    const file = folder.createFile(blob);
    fileUrl = file.getUrl();
  }

  const rows = [];
  invoiceData.products.forEach(function(item, index){
    const transactionId = transactionIds[index];
    const total = (item.qty * item.harga) - item.diskon;
    const bayarItem = Math.min(sisaBayar, total);
    const kurangBayar = total - bayarItem;
    const status = kurangBayar > 0 ? "PENJUALAN KREDIT" : "PENJUALAN TUNAI";
    const tanggalBayar = bayarItem > 0 ? tanggal : "";
    sisaBayar = sisaBayar - bayarItem;
    const akunFromClient = String(item.akun || "").trim();
    const akunPendapatan = akunFromClient || getProductAccountFast_(item.produk, ss);

    rows.push([
      "",
      tanggal,
      bulan,
      tahun,
      invoiceNo,
      invoiceData.customer,
      item.produk,
      item.qty,
      item.satuan,
      item.harga,
      item.diskon,
      total,
      bayarItem,
      kurangBayar,
      status,
      tanggalBayar,
      false,
      akunPendapatan,
      transactionId,
      "POST",
      invoiceData.rekening || "",
      fileUrl
    ]);
  });

  if (rows.length) {
    const startRow = sh.getLastRow() + 1;
    sh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  }

  if (mutasiNominal > 0 && invoiceData.rekening) {
    const shMutasi = ss.getSheetByName("MUTASI_DANA");
    if (shMutasi) {
      const transMutasiNo = Math.max(1, shMutasi.getLastRow());
      const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
      const transMutasiId = "TX-MB-" + dateStr + "-" + transMutasiNo;

      shMutasi.appendRow([
        new Date(invoiceData.tanggal),
        "Masuk",
        "",
        "Customer: " + invoiceData.customer,
        invoiceData.rekening,
        mutasiNominal,
        "Pembayaran " + invoiceNo,
        false,
        transMutasiId
      ]);
    }
  }

  let subtotal = 0;
  let totalDiskon = 0;

  invoiceData.products.forEach(function(item){
    subtotal += item.qty * item.harga;
    totalDiskon += item.diskon;
  });

  const grandTotal = subtotal - totalDiskon;
  const kurangBayarAkhir = Math.max(0, grandTotal - invoiceData.bayar);
  const statusTagihan = kurangBayarAkhir > 0 ? "BELUM LUNAS" : "LUNAS";

  return {
    success: true, invoiceNo: invoiceNo, tanggal: invoiceData.tanggal,
    customer: invoiceData.customer, products: invoiceData.products,
    subtotal: subtotal, diskon: totalDiskon, grandTotal: grandTotal,
    bayar: invoiceData.bayar, kurangBayar: kurangBayarAkhir, status: statusTagihan
  };
}

function generateInvoiceNumber(){
  return nextInvoiceNumber_();
}

function getProductAccount(productName){
  const products = getProducts();
  const product = products.find(p => p.nama === productName);
  if(!product){ return "PENDAPATAN"; }
  return product.akun;
}

function generateTransactionId(){
  return allocateTransactionIds_(1)[0];
}

function getNextTransactionNumber(){
  const seq = Number(getSettingValue_("TRANSACTION_SEQ"));
  if (!isNaN(seq) && getSettingValue_("TRANSACTION_SEQ") !== null) {
    return seq + 1;
  }
  return scanMaxTransactionSeqFromSheet_() + 1;
}

function getSettings(){
  authGuard_();
  const cache = loadSettingsCache_();
  const settings = {};
  Object.keys(cache).forEach(function(k) {
    settings[k] = cache[k];
  });
  return settings;
}

function saveSettings(settingsMap) {
  assertRole_(["owner"]);
  if (!settingsMap || typeof settingsMap !== "object") {
    throw new Error("Data setting tidak valid.");
  }
  Object.keys(settingsMap).forEach(function(key) {
    setSettingValue_(key, settingsMap[key]);
  });
  return { success: true };
}

function extractDriveFileId_(url) {
  const s = String(url || "").trim();
  if (!s) throw new Error("URL logo kosong.");
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  throw new Error("Format URL / ID Google Drive logo tidak valid.");
}

function getCompanyLogoBase64() {
  authGuard_();
  const url = getSettingValue_("COMPANY_LOGO_URL");
  if (!url) return null;
  try {
    const fileId = extractDriveFileId_(url);
    const blob = DriveApp.getFileById(fileId).getBlob();
    const mime = blob.getContentType();
    if (mime.indexOf("image/") !== 0) {
      throw new Error("File logo harus berupa gambar (PNG/JPG).");
    }
    return {
      mime: mime,
      base64: Utilities.base64Encode(blob.getBytes())
    };
  } catch (err) {
    throw new Error("Gagal memuat logo: " + err.message);
  }
}

function getInvoiceHistory(startDate, endDate, selectedCustomer) {
  authGuard_();
  try {
    const ss = SpreadsheetApp.openById(DATABASE_ID);
    const sh = ss.getSheetByName("PEMASUKAN");
    if (!sh) throw new Error("Sheet PEMASUKAN tidak ditemukan!");
    
    const data = sh.getDataRange().getValues();
    const invoiceMap = {};

    const startObj = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
    const endObj = endDate ? new Date(endDate).setHours(23,59,59,999) : null;

    for(let i = 1; i < data.length; i++){
      let rawInvoiceNo = String(data[i][4] || "").trim();
      if(!rawInvoiceNo || rawInvoiceNo.toLowerCase() === "no invoice") continue;

      const customerName = String(data[i][5] || "").trim();

      if (selectedCustomer && selectedCustomer !== "all" && customerName !== selectedCustomer) {
        continue;
      }

      const rowDateObj = new Date(data[i][1]);
      if(isNaN(rowDateObj.getTime())) continue; 
      
      const rowTime = rowDateObj.getTime();
      if (startObj && endObj) {
        if (rowTime < startObj || rowTime > endObj) {
          continue; 
        }
      }

      const key = rawInvoiceNo.toUpperCase();

      if(!invoiceMap[key]){
        invoiceMap[key] = {
          tanggal: Utilities.formatDate(rowDateObj, Session.getScriptTimeZone(), "dd/MM/yyyy"),
          invoiceNo: rawInvoiceNo, 
          customer: customerName,
          grandTotal: 0,
          bayar: 0,
          sisaTagihan: 0
        };
      }
      
      invoiceMap[key].grandTotal += Number(data[i][11]) || 0;
      invoiceMap[key].bayar += Number(data[i][12]) || 0;
      invoiceMap[key].sisaTagihan += Number(data[i][13]) || 0;
    }
    
    return Object.values(invoiceMap).reverse();
    
  } catch(e) {
    console.error(e);
    return [];
  }
}

function getInvoiceDetail(invoiceNo){
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();
  const items = [];
  let isPosted = false; 

  for(let i = 1; i < data.length; i++){ 
    if(String(data[i][4]).trim() === String(invoiceNo).trim()){
      if (data[i][16] === true) isPosted = true;

      items.push({
        tanggal: Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), "dd/MM/yyyy"),
        invoiceNo: data[i][4],
        customer: data[i][5],
        produk: data[i][6],
        qty: data[i][7],
        satuan: String(data[i][8] || "").trim(),
        harga: data[i][9],
        diskon: data[i][10],
        total: data[i][11],
        bayar: data[i][12],
        sisaTagihan: data[i][13],
        posted: data[i][16]
      });
    }
  }
  
  return { items: items, isPosted: isPosted };
}

function getInvoiceForEdit(invoiceNo) {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();
  
  const result = {
    tanggal: "",
    customer: "",
    products: [],
    bayar: 0,
    rekening: ""
  };

  for(let i = 1; i < data.length; i++) {
    if(String(data[i][4]).trim() === String(invoiceNo).trim()) {
      result.tanggal = Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), "yyyy-MM-dd");
      result.customer = data[i][5];
      result.bayar += Number(data[i][12]) || 0;
      if (!result.rekening && data[i][20]) {
        result.rekening = String(data[i][20]);
      }

      result.products.push({
        produk: data[i][6],
        qty: data[i][7],
        satuan: data[i][8],
        harga: data[i][9],
        diskon: data[i][10]
      });
    }
  }
  return result;
}

function updateInvoice(invoiceNo, invoiceData) {
  authGuard_();
  validateInvoiceData_(invoiceData);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getDatabaseSpreadsheet_();
    const targetInvoice = String(invoiceNo).trim();

    if (isInvoicePosted_(ss, targetInvoice)) {
      throw new Error("Invoice sudah diposting dan tidak bisa diedit.");
    }

    const totalPelunasan = getTotalPelunasanInvoice_(ss, targetInvoice);
    if (totalPelunasan > 0) {
      throw new Error(
        "Invoice yang sudah memiliki riwayat pelunasan tidak bisa diedit. " +
        "Buat invoice baru jika perlu koreksi."
      );
    }

    const bayarAwal = invoiceData.bayar;

    const sh = ss.getSheetByName("PEMASUKAN");
    removeMutasiByInvoicePayment_(ss, targetInvoice);
    deleteInvoiceRows_(sh, targetInvoice);

    return persistInvoice_(invoiceData, targetInvoice, ss, { mutasiNominal: bayarAwal });
  } catch(err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function getInvoiceDetailsExport(startDate, endDate, selectedCustomer) {
  authGuard_();
  try {
    const ss = SpreadsheetApp.openById(DATABASE_ID);
    const sh = ss.getSheetByName("PEMASUKAN");
    const data = sh.getDataRange().getValues();
    const startObj = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
    const endObj = endDate ? new Date(endDate).setHours(23,59,59,999) : null;
    const result = [];

    for(let i = 1; i < data.length; i++){
      let rawInvoiceNo = String(data[i][4] || "").trim();
      if(!rawInvoiceNo || rawInvoiceNo.toLowerCase() === "no invoice") continue;

      const customerName = String(data[i][5] || "").trim();
      if (selectedCustomer && selectedCustomer !== "all" && customerName !== selectedCustomer) continue;

      const rowDateObj = new Date(data[i][1]);
      if(isNaN(rowDateObj.getTime())) continue;

      const rowTime = rowDateObj.getTime();
      if (startObj && endObj) {
        if (rowTime < startObj || rowTime > endObj) continue;
      }

      result.push({
        "Tanggal": Utilities.formatDate(rowDateObj, Session.getScriptTimeZone(), "dd/MM/yyyy"),
        "No Invoice": rawInvoiceNo,
        "Customer": customerName,
        "Produk": String(data[i][6] || ""),
        "Qty": Number(data[i][7]) || 0,
        "Satuan": String(data[i][8] || ""),
        "Harga Satuan": Number(data[i][9]) || 0,
        "Diskon": Number(data[i][10]) || 0,
        "Total": Number(data[i][11]) || 0
      });
    }
    return result.reverse();
  } catch(e) {
    console.error(e);
    return [];
  }
}

function getDaftarPiutang(startDate, endDate, selectedCustomer) {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const shPemasukan = ss.getSheetByName("PEMASUKAN");
  const data = shPemasukan.getDataRange().getValues();

  let piutangList = [];
  let mapInvoice = {};

  const startObj = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
  const endObj = endDate ? new Date(endDate).setHours(23,59,59,999) : null;

  for (let i = 1; i < data.length; i++) {
    let invNo = String(data[i][4] || "").trim();
    let customerName = String(data[i][5] || "").trim();
    let kurangBayar = Number(data[i][13]) || 0;

    if (!invNo || invNo.toLowerCase() === "no invoice") continue;
    if (kurangBayar <= 0) continue;

    // Filter Customer
    if (selectedCustomer && selectedCustomer !== "all" && customerName !== selectedCustomer) continue;

    const rowDateObj = new Date(data[i][1]);
    if(isNaN(rowDateObj.getTime())) continue;

    // Filter Tanggal
    const rowTime = rowDateObj.getTime();
    if (startObj && endObj) {
      if (rowTime < startObj || rowTime > endObj) continue;
    }

    // Kelompokkan data berdasarkan Nomor Invoice
    if (!mapInvoice[invNo]) {
      mapInvoice[invNo] = {
        tanggal: Utilities.formatDate(rowDateObj, Session.getScriptTimeZone(), "yyyy-MM-dd"),
        invoiceNo: invNo,
        customer: customerName,
        grandTotal: 0,
        sisaTagihan: 0
      };
    }

    // Ambil angkanya LANGSUNG dari sheet PEMASUKAN
    mapInvoice[invNo].grandTotal += Number(data[i][11]) || 0; // Kolom L
    mapInvoice[invNo].sisaTagihan += Number(data[i][13]) || 0; // Kolom N
  }

  // Masukkan ke daftar hanya jika Kurang Bayar > 0
  for (let key in mapInvoice) {
    if (mapInvoice[key].sisaTagihan > 0) {
      piutangList.push(mapInvoice[key]);
    }
  }

  return piutangList.reverse();
}
