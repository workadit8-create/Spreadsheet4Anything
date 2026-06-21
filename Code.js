// Entry point — logic dipisah per modul (R1 refactor)
// Config, Auth, Helpers, Dashboard, MasterData, Transaksi, HutangPembelian,
// KasBank, Jurnal, Quotation, PurchaseRequest, Proyek, Laporan, Posting, PageBootstrap, QaSmokeTest*

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

function warmUpSession() {
  try {
    authGuard_();
    ensureSeqPropsFromSetting_();
    loadSettingsCache_();
    const ss = getDatabaseSpreadsheet_();
    const sh = ss.getSheetByName("PEMASUKAN");
    if (sh) sh.getRange(1, 1).getValue();
    syncSeqPropsToSetting_();
  } catch (ignore) {}
  return { ok: true };
}

function testDatabase() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  return {
    namaSpreadsheet: ss.getName(),
    sheets: ss.getSheets().map(function(s) { return s.getName(); })
  };
}
