// Bootstrap data halaman — satu round-trip google.script.run per form.
// ==========================================

function getPembelianPageBootstrap() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();

  let purchaseRequests = [];
  const shPr = ss.getSheetByName("PURCHASE_REQUEST");
  if (shPr && shPr.getLastRow() >= 2) {
    purchaseRequests = groupPurchaseRequestRows_(shPr.getDataRange().getValues(), function(row) {
      return String(row[11] || "AKTIF").trim().toUpperCase() !== "CONVERTED";
    });
  }

  return {
    masterPembelian: getMasterDataPembelian(),
    rekening: getListKasBank(),
    suppliers: getSuppliers(),
    purchaseRequests: purchaseRequests,
    proyekOptions: isAddonProjectEnabled_() ? listProyekForDropdown() : []
  };
}

function getInvoiceFormBootstrap() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();

  let quotations = [];
  const shQt = ss.getSheetByName("QUOTATION");
  if (shQt && shQt.getLastRow() >= 2) {
    quotations = groupQuotationRows_(shQt.getDataRange().getValues(), function(row) {
      return String(row[9] || "AKTIF").trim().toUpperCase() !== "CONVERTED";
    });
  }

  return {
    customers: getCustomers(),
    products: getProducts(),
    rekening: getListKasBank(),
    quotations: quotations,
    proyekOptions: isAddonProjectEnabled_() ? listProyekForDropdown() : []
  };
}
