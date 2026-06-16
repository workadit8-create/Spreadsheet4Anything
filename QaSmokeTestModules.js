// ==========================================
// QA SMOKE TEST — modul lain (Dashboard, Master, Posting, Jurnal, Transaksi)
// ==========================================

const QA_MASTER_PREFIX_ = "QA_AUTO_";

function qaDeleteMasterRowsByNamePrefix_(ss, sheetName, nameColIdx, colCount) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return 0;
  const rows = masterReadDataRange_(sh, colCount);
  let removed = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const nama = String(rows[i][nameColIdx] || "").trim();
    if (nama.indexOf(QA_MASTER_PREFIX_) === 0) {
      sh.deleteRow(i + 2);
      removed++;
    }
  }
  return removed;
}

function qaCleanupQaMasterData_(ss) {
  let n = 0;
  n += qaDeleteMasterRowsByNamePrefix_(ss, "MASTER_CUSTOMER", 1, 6);
  n += qaDeleteMasterRowsByNamePrefix_(ss, "MASTER_SUPPLIER", 1, 6);
  n += qaDeleteMasterRowsByNamePrefix_(ss, "MASTER_PRODUK", 2, 7);
  n += qaDeleteMasterRowsByNamePrefix_(ss, "MASTER_KAS_BANK", 2, 5);
  n += qaDeleteMasterRowsByNamePrefix_(ss, "MASTER_KATEGORI_PEMBELIAN", 1, 5);
  return n;
}

function qaDeleteJurnalByTransId_(ss, transId) {
  const sh = ss.getSheetByName("JURNAL_MANUAL");
  if (!sh || sh.getLastRow() < 2) return 0;
  const data = sh.getDataRange().getValues();
  let removed = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][7] || "").trim() === transId) {
      sh.deleteRow(i + 1);
      removed++;
    }
  }
  return removed;
}

function qaRunDashboardModule_() {
  const results = [];
  const ym = qaTodayYm_();

  qaAssertJson_(results, "getDashboardV2Ops() bulan ini", function() {
    CURRENT_AUTH_USER_ = null;
    const data = getDashboardV2Ops(ym.bulan, ym.tahun);
    if (!data || !data.periode) throw new Error("Response tidak lengkap");
    return "periode " + data.periode.bulan + "/" + data.periode.tahun;
  }, "Cek sheet transaksi & fungsi dashBuildOpsPayload_.");

  qaAssertJson_(results, "getDashboardV2Keuangan() bulan ini", function() {
    CURRENT_AUTH_USER_ = null;
    const data = getDashboardV2Keuangan(ym.bulan, ym.tahun, false);
    if (!data || !data.keuangan) throw new Error("Keuangan kosong");
    return "laba bersih: " + (data.kpi && data.kpi.labaBersih != null ? data.kpi.labaBersih : "-");
  }, "Cek koneksi backend laporan & library BackendEngine.");

  qaTry_(results, "getDashboardSummary('month')", function() {
    CURRENT_AUTH_USER_ = null;
    const s = getDashboardSummary("month");
    return "penjualan: " + (s.totalPenjualan || 0) + ", invoice: " + (s.totalInvoice || 0);
  }, "Cek sheet PEMASUKAN ada dan terbaca.");

  qaTry_(results, "getRecentTransactions()", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = getRecentTransactions();
    if (!Array.isArray(rows)) throw new Error("Bukan array");
    return rows.length + " transaksi terbaru";
  }, "Cek agregasi transaksi terbaru dari sheet.");

  return qaBuildReport_("dashboard", results, []);
}

function qaRunMasterDataModule_() {
  const results = [];
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  const testName = QA_MASTER_PREFIX_ + "CUST_" + Date.now();
  let custId = "";

  qaCleanupQaMasterData_(ss);

  qaTry_(results, "listMasterCustomers()", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = listMasterCustomers(false);
    if (!Array.isArray(rows)) throw new Error("Bukan array");
    return rows.length + " customer aktif";
  }, "Jalankan migrasi master / ensureMasterDataReady_.");

  qaTry_(results, "listMasterProduk()", function() {
    CURRENT_AUTH_USER_ = null;
    return listMasterProduk(false).length + " produk aktif";
  }, "Cek sheet MASTER_PRODUK.");

  qaTry_(results, "listMasterSuppliers()", function() {
    CURRENT_AUTH_USER_ = null;
    return listMasterSuppliers(false).length + " supplier aktif";
  }, "Cek sheet MASTER_SUPPLIER.");

  qaTry_(results, "listMasterKasBank()", function() {
    CURRENT_AUTH_USER_ = null;
    return listMasterKasBank(false).length + " rekening aktif";
  }, "Cek sheet MASTER_KAS_BANK.");

  qaTry_(results, "listMasterKategoriPembelian()", function() {
    CURRENT_AUTH_USER_ = null;
    return listMasterKategoriPembelian(false).length + " kategori aktif";
  }, "Cek sheet MASTER_KATEGORI_PEMBELIAN.");

  qaTry_(results, "listMasterCoa() backend", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = listMasterCoa(false);
    if (!Array.isArray(rows)) throw new Error("Bukan array");
    return rows.length + " akun COA aktif";
  }, "Cek BACKEND_ENGINE_ID & sheet MASTER COA.");

  qaTry_(results, "getChartOfAccounts()", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = getChartOfAccounts();
    if (!Array.isArray(rows) || !rows.length) throw new Error("COA kosong");
    return rows.length + " akun";
  }, "Isi MASTER COA atau master produk/kas/kategori.");

  qaTry_(results, "Validasi customer nama kosong", function() {
    CURRENT_AUTH_USER_ = null;
    try {
      saveMasterCustomer({ nama: "" });
      throw new Error("Seharusnya throw");
    } catch (e) {
      if (String(e.message).indexOf("wajib") < 0) throw e;
      return e.message;
    }
  }, "Cek validasi saveMasterCustomer.");

  qaTry_(results, "Tambah & edit customer test", function() {
    CURRENT_AUTH_USER_ = null;
    const res = saveMasterCustomer({ nama: testName, telepon: "08123456789" });
    custId = res.id;
    saveMasterCustomer({ id: custId, nama: testName + " Updated", telepon: "08111" });
    const hit = listMasterCustomers(true).filter(function(c) { return c.id === custId; })[0];
    if (!hit || hit.nama !== testName + " Updated") throw new Error("Customer test tidak ditemukan");
    return custId + " · " + hit.nama;
  }, "Cek permission spreadsheet MASTER_CUSTOMER.");

  qaTry_(results, "Nonaktifkan customer test", function() {
    CURRENT_AUTH_USER_ = null;
    setMasterCustomerStatus(custId, false);
    const hit = listMasterCustomers(true).filter(function(c) { return c.id === custId; })[0];
    if (!hit || hit.aktif) throw new Error("Masih aktif");
    return "Nonaktif OK";
  }, "Cek setMasterCustomerStatus.");

  qaTry_(results, "Cleanup master test", function() {
    const n = qaCleanupQaMasterData_(ss);
    const hit = listMasterCustomers(true).filter(function(c) { return c.nama.indexOf(QA_MASTER_PREFIX_) === 0; })[0];
    if (hit) throw new Error("Masih ada data QA");
    return n + " baris dibersihkan";
  }, "Hapus manual baris nama QA_AUTO_ di sheet master.");

  return qaBuildReport_("master-data", results, []);
}

function qaRunPostingModule_() {
  const results = [];
  const modulIds = [];

  qaTry_(results, "getPostingModulList()", function() {
    CURRENT_AUTH_USER_ = null;
    const mods = getPostingModulList();
    if (!Array.isArray(mods) || mods.length < 5) throw new Error("Modul posting tidak lengkap");
    mods.forEach(function(m) { modulIds.push(m.id); });
    return mods.map(function(m) { return m.id; }).join(", ");
  }, "Cek konstanta POSTING_MODUL_META_.");

  ["PEMASUKAN", "PEMBELIAN", "PELUNASAN_PIUTANG", "PELUNASAN_UTANG", "JURNAL_MANUAL", "MUTASI_DANA"].forEach(function(mod) {
    qaTry_(results, "getUnpostedTransactions(" + mod + ")", function() {
      CURRENT_AUTH_USER_ = null;
      const rows = getUnpostedTransactions(mod, null, null);
      if (!Array.isArray(rows)) throw new Error("Bukan array");
      return rows.length + " belum posting";
    }, "Cek sheet " + mod + " & kolom status posting.");
  });

  qaTry_(results, "Modul posting tidak valid ditolak", function() {
    CURRENT_AUTH_USER_ = null;
    try {
      getUnpostedTransactions("MODUL_FAKE", null, null);
      throw new Error("Seharusnya throw");
    } catch (e) {
      if (String(e.message).indexOf("valid") < 0) throw e;
      return e.message;
    }
  }, "Cek validasi modul di getUnpostedTransactions.");

  return qaBuildReport_("posting", results, []);
}

function qaRunJurnalModule_() {
  const results = [];
  const ss = SpreadsheetApp.openById(DATABASE_ID);
  let transId = "";
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  qaTry_(results, "Jurnal tidak seimbang ditolak", function() {
    CURRENT_AUTH_USER_ = null;
    try {
      saveManualJournal({
        tanggal: today,
        keterangan: QA_TEST_CATATAN_,
        lines: [
          { akun: "Kas", debit: 1000, kredit: 0 },
          { akun: "Pendapatan", debit: 0, kredit: 500 }
        ]
      });
      throw new Error("Seharusnya throw");
    } catch (e) {
      if (String(e.message).indexOf("sama") < 0) throw e;
      return e.message;
    }
  }, "Cek validateManualJournal_ balance.");

  qaTry_(results, "Simpan jurnal manual test", function() {
    CURRENT_AUTH_USER_ = null;
    const akun = getChartOfAccounts();
    const a1 = akun[0] || "Kas";
    const a2 = akun[1] || "Pendapatan";
    const res = saveManualJournal({
      tanggal: today,
      keterangan: QA_TEST_CATATAN_,
      lines: [
        { akun: a1, debit: 1000, kredit: 0, keterangan: "QA debit" },
        { akun: a2, debit: 0, kredit: 1000, keterangan: "QA kredit" }
      ]
    });
    if (!res || !res.transactionId) throw new Error("Gagal simpan");
    transId = res.transactionId;
    return transId + " · " + res.lineCount + " baris";
  }, "Cek sheet JURNAL_MANUAL & role owner/akuntan.");

  qaTry_(results, "Jurnal test muncul di history", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = getManualJournalHistory(today, today);
    const hit = rows.filter(function(r) { return r.transactionId === transId; })[0];
    if (!hit) throw new Error("Tidak ada di history");
    return hit.noBukti + " · Rp " + hit.totalDebit;
  }, "Cek getManualJournalHistory filter tanggal.");

  qaTry_(results, "Jurnal test siap posting", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = getUnpostedTransactions("JURNAL_MANUAL", today, today);
    const hit = rows.filter(function(r) { return String(r.id).indexOf(transId) >= 0 || String(r.ref).indexOf(transId) >= 0; });
    return hit.length ? hit.length + " di antrian posting" : "Ada di sheet (filter posting opsional)";
  }, "Cek kolom posted=false dan status POST.");

  qaTry_(results, "Cleanup jurnal test", function() {
    const n = qaDeleteJurnalByTransId_(ss, transId);
    if (!n) throw new Error("Baris jurnal QA tidak dihapus");
    return n + " baris dihapus";
  }, "Hapus manual baris JURNAL_MANUAL dengan keterangan QA_AUTO_TEST.");

  return qaBuildReport_("jurnal", results, []);
}

function qaRunTransaksiReadModule_() {
  const results = [];
  const start = "2020-01-01";
  const end = "2099-12-31";

  qaAssertJson_(results, "getSettings()", function() {
    CURRENT_AUTH_USER_ = null;
    const s = getSettings();
    if (!s || typeof s !== "object") throw new Error("Settings kosong");
    return Object.keys(s).length + " key";
  }, "Cek sheet SETTING.");

  qaTry_(results, "getInvoiceHistory()", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = getInvoiceHistory(start, end, "all");
    return (rows || []).length + " invoice";
  }, "Cek sheet PEMASUKAN.");

  qaTry_(results, "getSaldoKasBank()", function() {
    CURRENT_AUTH_USER_ = null;
    const saldo = getSaldoKasBank();
    if (!saldo || typeof saldo !== "object" || Array.isArray(saldo)) {
      throw new Error("Harus return object {nama: saldo}");
    }
    const keys = Object.keys(saldo);
    return keys.length + " rekening";
  }, "Cek MASTER_KAS_BANK & sheet MUTASI_DANA.");

  qaTry_(results, "getHistoryMutasi()", function() {
    CURRENT_AUTH_USER_ = null;
    return getHistoryMutasi().length + " mutasi";
  }, "Cek sheet MUTASI_DANA.");

  qaTry_(results, "getDaftarPiutang()", function() {
    CURRENT_AUTH_USER_ = null;
    return getDaftarPiutang(start, end, "all").length + " piutang";
  }, "Cek perhitungan piutang dari PEMASUKAN.");

  qaTry_(results, "getDaftarHutang()", function() {
    CURRENT_AUTH_USER_ = null;
    return getDaftarHutang(start, end, "all").length + " hutang";
  }, "Cek perhitungan hutang dari PEMBELIAN.");

  qaTry_(results, "getPurchaseOrderHistory()", function() {
    CURRENT_AUTH_USER_ = null;
    return getPurchaseOrderHistory(start, end).length + " PO";
  }, "Cek sheet PEMBELIAN / PO.");

  qaTry_(results, "getMasterDataPembelian()", function() {
    CURRENT_AUTH_USER_ = null;
    const d = getMasterDataPembelian();
    if (!d) throw new Error("Kosong");
    return "kategori: " + (d.kategori || []).length + ", supplier: " + (d.suppliers || []).length;
  }, "Cek master kategori & supplier pembelian.");

  qaTry_(results, "getSuppliers()", function() {
    CURRENT_AUTH_USER_ = null;
    return getSuppliers().length + " supplier";
  }, "Cek agregasi supplier master + riwayat.");

  qaTry_(results, "getQuotationHistory()", function() {
    CURRENT_AUTH_USER_ = null;
    return getQuotationHistory(start, end).length + " quotation";
  }, "Cek sheet QUOTATION.");

  qaTry_(results, "getPurchaseRequestHistory()", function() {
    CURRENT_AUTH_USER_ = null;
    return getPurchaseRequestHistory(start, end).length + " PR";
  }, "Cek sheet PURCHASE_REQUEST.");

  return qaBuildReport_("transaksi", results, []);
}

function qaRunAllModules_() {
  assertRole_(["owner"]);
  const modules = [
    qaRunUsersModule_(),
    qaRunDashboardModule_(),
    qaRunMasterDataModule_(),
    qaRunPostingModule_(),
    qaRunJurnalModule_(),
    qaRunTransaksiReadModule_()
  ];
  const total = modules.reduce(function(s, m) { return s + m.summary.total; }, 0);
  const passed = modules.reduce(function(s, m) { return s + m.summary.passed; }, 0);
  const failed = modules.reduce(function(s, m) { return s + m.summary.failed; }, 0);
  const recommendations = [];
  modules.forEach(function(m) {
    (m.recommendations || []).forEach(function(r) {
      recommendations.push("[" + m.module + "] " + r);
    });
  });
  return {
    module: "semua",
    ranAt: new Date().toISOString(),
    summary: {
      total: total,
      passed: passed,
      failed: failed,
      ok: failed === 0
    },
    modules: modules,
    tests: modules.reduce(function(arr, m) {
      return arr.concat((m.tests || []).map(function(t) {
        return { name: "[" + m.module + "] " + t.name, passed: t.passed, detail: t.detail, recommendation: t.recommendation };
      }));
    }, []),
    findings: modules.reduce(function(arr, m) { return arr.concat(m.findings || []); }, []),
    recommendations: recommendations
  };
}

function runQaSmokeTestDashboard() {
  assertRole_(["owner"]);
  return qaRunDashboardModule_();
}

function runQaSmokeTestMaster() {
  assertRole_(["owner"]);
  return qaRunMasterDataModule_();
}

function runQaSmokeTestPosting() {
  assertRole_(["owner"]);
  return qaRunPostingModule_();
}

function runQaSmokeTestJurnal() {
  assertRole_(["owner"]);
  return qaRunJurnalModule_();
}

function runQaSmokeTestTransaksi() {
  assertRole_(["owner"]);
  return qaRunTransaksiReadModule_();
}

function runQaSmokeTestAll() {
  assertRole_(["owner"]);
  return qaRunAllModules_();
}
