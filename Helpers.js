// Validasi transaksi, doGet, helper umum
// ==========================================
// CACHE SPREADSHEET (per eksekusi server — kurangi openById berulang)
// ==========================================

let SS_DATABASE_ = null;
let SETTINGS_CACHE_ = null;
let SETTINGS_ROW_MAP_ = null;

function getDatabaseSpreadsheet_() {
  if (!SS_DATABASE_) {
    SS_DATABASE_ = SpreadsheetApp.openById(DATABASE_ID);
  }
  return SS_DATABASE_;
}

function loadSettingsCache_() {
  if (SETTINGS_CACHE_) return SETTINGS_CACHE_;
  SETTINGS_CACHE_ = {};
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("SETTING");
  if (!sh) return SETTINGS_CACHE_;
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const k = String(data[i][0] || "").trim();
    if (k) SETTINGS_CACHE_[k] = data[i][1];
  }
  return SETTINGS_CACHE_;
}

function invalidateSettingsCache_() {
  SETTINGS_CACHE_ = null;
  SETTINGS_ROW_MAP_ = null;
}

function loadSettingsRowMap_(sh) {
  if (SETTINGS_ROW_MAP_) return SETTINGS_ROW_MAP_;
  SETTINGS_ROW_MAP_ = {};
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const k = String(data[i][0] || "").trim();
    if (k) SETTINGS_ROW_MAP_[k] = i + 1;
  }
  return SETTINGS_ROW_MAP_;
}

// ==========================================
// VALIDASI & HELPER INTERNAL
// ==========================================

function validateInvoiceData_(invoiceData) {
  if (!invoiceData.tanggal) {
    throw new Error("Tanggal invoice wajib diisi.");
  }
  if (!invoiceData.customer || !String(invoiceData.customer).trim()) {
    throw new Error("Customer wajib dipilih.");
  }
  if (!invoiceData.products || invoiceData.products.length === 0) {
    throw new Error("Minimal harus ada 1 produk.");
  }

  let grandTotal = 0;
  invoiceData.products.forEach(function(item, idx) {
    const baris = idx + 1;
    if (!item.produk || !String(item.produk).trim()) {
      throw new Error("Produk baris " + baris + " wajib dipilih.");
    }
    const qty = Number(item.qty);
    if (!qty || qty <= 0) {
      throw new Error("Qty baris " + baris + " harus lebih dari 0.");
    }
    const harga = Number(item.harga);
    if (isNaN(harga) || harga < 0) {
      throw new Error("Harga baris " + baris + " tidak valid.");
    }
    const diskon = Number(item.diskon) || 0;
    if (diskon < 0) {
      throw new Error("Diskon baris " + baris + " tidak boleh negatif.");
    }
    const totalBaris = qty * harga - diskon;
    if (totalBaris < 0) {
      throw new Error("Total baris " + baris + " tidak valid.");
    }
    grandTotal += totalBaris;
  });

  const bayar = Number(invoiceData.bayar) || 0;
  if (bayar < 0) {
    throw new Error("Nominal bayar tidak boleh negatif.");
  }
  if (bayar > grandTotal) {
    throw new Error("Nominal bayar tidak boleh melebihi total invoice.");
  }
  if (bayar > 0 && (!invoiceData.rekening || !String(invoiceData.rekening).trim())) {
    throw new Error("Rekening tujuan wajib dipilih jika ada pembayaran.");
  }

  invoiceData.bayar = bayar;
  return grandTotal;
}

function validatePelunasanPayload_(payload, sisaPiutang) {
  if (!payload.tanggal) {
    throw new Error("Tanggal bayar wajib diisi.");
  }
  if (!payload.invoice || !String(payload.invoice).trim()) {
    throw new Error("Nomor invoice wajib.");
  }
  const nominal = Number(payload.nominal);
  if (!nominal || nominal <= 0) {
    throw new Error("Nominal bayar harus lebih dari 0.");
  }
  if (nominal > sisaPiutang) {
    throw new Error("Nominal bayar tidak boleh melebihi sisa piutang.");
  }
  if (!payload.rekening || !String(payload.rekening).trim()) {
    throw new Error("Rekening tujuan wajib dipilih.");
  }
  payload.nominal = nominal;
}

function validatePelunasanHutangPayload_(payload, sisaHutang) {
  if (!payload.tanggal) {
    throw new Error("Tanggal bayar wajib diisi.");
  }
  if (!payload.po || !String(payload.po).trim()) {
    throw new Error("Nomor PO wajib.");
  }
  const nominal = Number(payload.nominal);
  if (!nominal || nominal <= 0) {
    throw new Error("Nominal bayar harus lebih dari 0.");
  }
  if (nominal > sisaHutang) {
    throw new Error("Nominal bayar tidak boleh melebihi sisa hutang.");
  }
  if (!payload.rekening || !String(payload.rekening).trim()) {
    throw new Error("Rekening sumber pembayaran wajib dipilih.");
  }
  payload.nominal = nominal;
}

function validateMutasiDana_(p) {
  if (!p.tanggal) {
    throw new Error("Tanggal mutasi wajib diisi.");
  }
  const nominal = Number(p.nominal);
  if (!nominal || nominal <= 0) {
    throw new Error("Nominal mutasi harus lebih dari 0.");
  }
  p.nominal = nominal;

  const jenis = String(p.jenis || "").trim();
  if (jenis === "Transfer") {
    if (!p.sumber || !String(p.sumber).trim()) {
      throw new Error("Rekening sumber wajib dipilih.");
    }
    if (!p.tujuan || !String(p.tujuan).trim()) {
      throw new Error("Rekening tujuan wajib dipilih.");
    }
    if (p.sumber === p.tujuan) {
      throw new Error("Rekening sumber dan tujuan tidak boleh sama.");
    }
  } else if (jenis === "Masuk") {
    if (!p.tujuan || !String(p.tujuan).trim()) {
      throw new Error("Rekening tujuan wajib dipilih untuk setoran.");
    }
  } else if (jenis === "Keluar") {
    if (!p.sumber || !String(p.sumber).trim()) {
      throw new Error("Rekening sumber wajib dipilih untuk penarikan.");
    }
  }
}

function validatePembelian_(p) {
  if (!p.tanggal) {
    throw new Error("Tanggal pembelian wajib diisi.");
  }
  if (!p.supplier || !String(p.supplier).trim()) {
    throw new Error("Nama supplier wajib diisi.");
  }
  if (!p.items || p.items.length === 0) {
    throw new Error("Minimal harus ada 1 barang.");
  }

  let grandTotal = 0;
  p.items.forEach(function(item, idx) {
    const baris = idx + 1;
    if (!item.kategori || !String(item.kategori).trim()) {
      throw new Error("Kategori baris " + baris + " wajib dipilih.");
    }
    if (!item.subKategori || !String(item.subKategori).trim()) {
      throw new Error("Sub-kategori baris " + baris + " wajib dipilih.");
    }
    if (!item.namaBrg || !String(item.namaBrg).trim()) {
      throw new Error("Nama barang baris " + baris + " wajib diisi.");
    }
    const qty = Number(item.qty);
    if (!qty || qty <= 0) {
      throw new Error("Qty baris " + baris + " harus lebih dari 0.");
    }
    const harga = Number(item.harga);
    if (isNaN(harga) || harga < 0) {
      throw new Error("Harga baris " + baris + " tidak valid.");
    }
    const diskon = Number(item.diskon) || 0;
    grandTotal += qty * harga - diskon;
  });

  if (grandTotal < 0) {
    throw new Error("Total pembelian tidak valid.");
  }

  const bayar = Number(p.bayar) || 0;
  if (bayar < 0) {
    throw new Error("Nominal bayar tidak boleh negatif.");
  }
  if (bayar > grandTotal) {
    throw new Error("Nominal bayar tidak boleh melebihi total pembelian.");
  }
  if (bayar > 0 && (!p.rekening || !String(p.rekening).trim())) {
    throw new Error("Rekening pengeluaran wajib dipilih jika ada pembayaran.");
  }
  p.bayar = bayar;
}

function deleteInvoiceRows_(sh, invoiceNo) {
  const data = sh.getDataRange().getValues();
  const target = String(invoiceNo).trim();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][4] || "").trim() === target) {
      sh.deleteRow(i + 1);
    }
  }
}

function removeMutasiByInvoicePayment_(ss, invoiceNo) {
  const shMutasi = ss.getSheetByName("MUTASI_DANA");
  if (!shMutasi) return;
  const data = shMutasi.getDataRange().getValues();
  const ketTarget = "Pembayaran " + String(invoiceNo).trim();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][6] || "").trim() === ketTarget) {
      shMutasi.deleteRow(i + 1);
    }
  }
}

function isInvoicePosted_(ss, invoiceNo) {
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();
  const target = String(invoiceNo).trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][4] || "").trim() === target && data[i][16] === true) {
      return true;
    }
  }
  return false;
}

function getSisaPiutangInvoice_(ss, invoiceNo) {
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();
  const target = String(invoiceNo).trim();
  let sisa = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][4] || "").trim() === target) {
      sisa += Number(data[i][13]) || 0;
    }
  }
  return sisa;
}

function getTotalPelunasanInvoice_(ss, invoiceNo) {
  const sh = ss.getSheetByName("PELUNASAN_PIUTANG");
  if (!sh) return 0;
  const data = sh.getDataRange().getValues();
  const target = String(invoiceNo).trim();
  let total = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || "").trim() === target) {
      total += Number(data[i][3]) || 0;
    }
  }
  return total;
}
