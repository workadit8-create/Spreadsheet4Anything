// Entry point — logic dipisah per modul (R1 refactor)
// Config, Auth, Helpers, Dashboard, MasterData, Transaksi, HutangPembelian,
// KasBank, Jurnal, Quotation, PurchaseRequest, Laporan, Posting, QaSmokeTest*

function doGet() {
  try {
    return HtmlService
      .createHtmlOutputFromFile('index')
      .setTitle('AKUNTANSI APP')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<h2>Gagal memuat aplikasi</h2><p>' + err.message + '</p>'
    );
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function testDatabase() {
  authGuard_();
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  return {
    namaSpreadsheet: ss.getName(),
    sheets: ss.getSheets().map(function(s) { return s.getName(); })
  };
}
