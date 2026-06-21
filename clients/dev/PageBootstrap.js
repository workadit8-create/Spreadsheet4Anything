// Bootstrap data halaman — satu round-trip google.script.run per form.
// ==========================================

function suppliersFromSpreadsheet_(ss) {
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

function getPembelianPageBootstrap() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  ensureMasterDataReady_(ss);

  const rekening = readMasterKasBank_(ss, true).map(function(k) {
    return { kode: k.kode, nama: k.nama };
  });

  let purchaseRequests = [];
  const shPr = ss.getSheetByName("PURCHASE_REQUEST");
  if (shPr && shPr.getLastRow() >= 2) {
    purchaseRequests = groupPurchaseRequestRows_(shPr.getDataRange().getValues(), function(row) {
      return String(row[11] || "AKTIF").trim().toUpperCase() !== "CONVERTED";
    });
  }

  return {
    masterPembelian: buildMasterPembelianMap_(ss),
    rekening: rekening,
    suppliers: suppliersFromSpreadsheet_(ss),
    purchaseRequests: purchaseRequests
  };
}

function getInvoiceFormBootstrap() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  ensureMasterDataReady_(ss);

  const customers = readMasterCustomers_(ss, true).map(function(c) { return c.nama; });
  const products = readMasterProduk_(ss, true).map(function(p) {
    return { kode: p.kode, nama: p.nama, harga: p.harga, akun: p.akun };
  });
  const rekening = readMasterKasBank_(ss, true).map(function(k) {
    return { kode: k.kode, nama: k.nama };
  });

  let quotations = [];
  const shQt = ss.getSheetByName("QUOTATION");
  if (shQt && shQt.getLastRow() >= 2) {
    quotations = groupQuotationRows_(shQt.getDataRange().getValues(), function(row) {
      return String(row[9] || "AKTIF").trim().toUpperCase() !== "CONVERTED";
    });
  }

  return {
    customers: customers,
    products: products,
    rekening: rekening,
    quotations: quotations
  };
}
