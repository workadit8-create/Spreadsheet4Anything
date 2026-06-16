// Dashboard V2
// ==========================================
// DASHBOARD V2 (Fase 1 + 2)
// ==========================================

function dashboardPrevPeriod_(bulan, tahun) {
  let m = Number(bulan) - 1;
  let y = Number(tahun);
  if (m < 1) { m = 12; y -= 1; }
  return { bulan: m, tahun: y };
}

function dashIsInPeriod_(dateVal, bulan, tahun) {
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  return d.getMonth() + 1 === Number(bulan) && d.getFullYear() === Number(tahun);
}

function dashParseMoney_(val) {
  if (val === "" || val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  let s = String(val).trim();
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[Rp.\s()]/g, "").replace(/,/g, "");
  const n = Number(s);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

function dashReadSheet_(ss, name, cols) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues();
}

function dashOpsFromPemasukan_(data, bulan, tahun) {
  let penjualan = 0;
  let piutangBaru = 0;
  const invoices = {};
  data.forEach(function(row) {
    if (!dashIsInPeriod_(row[1], bulan, tahun)) return;
    penjualan += Number(row[11]) || 0;
    piutangBaru += Number(row[13]) || 0;
    const inv = String(row[4] || "").trim();
    if (inv) invoices[inv] = true;
  });
  return {
    penjualan: penjualan,
    piutangBaru: piutangBaru,
    invoiceCount: Object.keys(invoices).length
  };
}

function dashPembelianFromData_(data, bulan, tahun) {
  let total = 0;
  data.forEach(function(row) {
    if (!dashIsInPeriod_(row[0], bulan, tahun)) return;
    total += Number(row[7]) || 0;
  });
  return total;
}

function dashPiutangFromPemasukan_(data) {
  const mapInvoice = {};
  data.forEach(function(row) {
    const invNo = String(row[4] || "").trim();
    const kurangBayar = Number(row[13]) || 0;
    if (!invNo || invNo.toLowerCase() === "no invoice" || kurangBayar <= 0) return;
    if (!mapInvoice[invNo]) {
      mapInvoice[invNo] = {
        invoiceNo: invNo,
        customer: String(row[5] || "").trim(),
        sisaTagihan: 0
      };
    }
    mapInvoice[invNo].sisaTagihan += kurangBayar;
  });
  const list = [];
  Object.keys(mapInvoice).forEach(function(k) {
    if (mapInvoice[k].sisaTagihan > 0) list.push(mapInvoice[k]);
  });
  let total = 0;
  list.forEach(function(r) { total += Number(r.sisaTagihan) || 0; });
  return { total: total, count: list.length, top: list.slice(-5).reverse() };
}

function dashHutangFromPembelian_(data) {
  const mapPO = {};
  data.forEach(function(row) {
    const poNo = String(row[1] || "").trim();
    const sisaTagihan = Number(row[12]) || 0;
    if (!poNo || sisaTagihan <= 0) return;
    if (!mapPO[poNo]) {
      mapPO[poNo] = {
        poNo: poNo,
        supplier: String(row[2] || "").trim(),
        sisaTagihan: 0
      };
    }
    mapPO[poNo].sisaTagihan += sisaTagihan;
  });
  const list = [];
  Object.keys(mapPO).forEach(function(k) {
    if (mapPO[k].sisaTagihan > 0) list.push(mapPO[k]);
  });
  let total = 0;
  list.forEach(function(r) { total += Number(r.sisaTagihan) || 0; });
  return { total: total, count: list.length, top: list.slice(-5).reverse() };
}

function dashKasFromMutasi_(ss, mutasiData) {
  const saldo = {};
  readMasterKasBank_(ss, true).forEach(function(k) {
    saldo[k.nama] = 0;
  });
  mutasiData.forEach(function(row) {
    const nominal = Number(row[5]) || 0;
    const dari = String(row[3] || "").trim();
    const ke = String(row[4] || "").trim();
    if (saldo.hasOwnProperty(dari)) saldo[dari] -= nominal;
    if (saldo.hasOwnProperty(ke)) saldo[ke] += nominal;
  });
  let total = 0;
  Object.keys(saldo).forEach(function(k) { total += Number(saldo[k]) || 0; });
  return total;
}

function dashChartsFromData_(pemasukan, pembelian, bulan, tahun) {
  const months = dashChartMonths_(bulan, tahun, 6);
  const chartMap = {};
  months.forEach(function(per) {
    chartMap[per.bulan + "-" + per.tahun] = {
      label: per.label,
      penjualan: 0,
      pembelian: 0
    };
  });
  pemasukan.forEach(function(row) {
    const d = row[1] instanceof Date ? row[1] : new Date(row[1]);
    if (isNaN(d.getTime())) return;
    const key = (d.getMonth() + 1) + "-" + d.getFullYear();
    if (chartMap[key]) chartMap[key].penjualan += Number(row[11]) || 0;
  });
  pembelian.forEach(function(row) {
    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (isNaN(d.getTime())) return;
    const key = (d.getMonth() + 1) + "-" + d.getFullYear();
    if (chartMap[key]) chartMap[key].pembelian += Number(row[7]) || 0;
  });
  return months.map(function(per) {
    return chartMap[per.bulan + "-" + per.tahun];
  });
}

function dashQuotationCount_(quotationData) {
  const seen = {};
  let count = 0;
  quotationData.forEach(function(row) {
    const qNo = String(row[1] || "").trim();
    if (!qNo || seen[qNo]) return;
    seen[qNo] = true;
    if (String(row[9] || "AKTIF").trim().toUpperCase() !== "CONVERTED") count += 1;
  });
  return count;
}

function dashActivitiesFromData_(pemasukan, pembelian, mutasi, jurnal, limit) {
  const items = [];
  const tz = Session.getScriptTimeZone();
  const fmtDate = function(d) {
    return Utilities.formatDate(d, tz, "dd/MM/yyyy");
  };
  const cap = limit || 15;

  const invAgg = {};
  pemasukan.forEach(function(row) {
    const inv = String(row[4] || "").trim();
    if (!inv) return;
    const d = row[1] instanceof Date ? row[1] : new Date(row[1]);
    const ts = isNaN(d.getTime()) ? 0 : d.getTime();
    if (!invAgg[inv]) {
      invAgg[inv] = {
        tanggalRaw: ts,
        tanggal: ts ? fmtDate(d) : "",
        deskripsi: String(row[5] || ""),
        total: 0,
        posted: false
      };
    }
    invAgg[inv].total += Number(row[11]) || 0;
    if (String(row[18] || "").toUpperCase() === "POSTED") invAgg[inv].posted = true;
  });
  Object.keys(invAgg).forEach(function(inv) {
    const a = invAgg[inv];
    if (!a.tanggalRaw) return;
    items.push({
      tanggalRaw: a.tanggalRaw,
      tanggal: a.tanggal,
      jenis: "Penjualan",
      ref: inv,
      deskripsi: a.deskripsi,
      nominal: a.total,
      posted: a.posted,
      menu: "loadInvoiceHistoryPage"
    });
  });

  const poAgg = {};
  pembelian.forEach(function(row) {
    const po = String(row[1] || "").trim();
    if (!po) return;
    const d = row[0] instanceof Date ? row[0] : new Date(row[0]);
    const ts = isNaN(d.getTime()) ? 0 : d.getTime();
    if (!poAgg[po]) {
      poAgg[po] = {
        tanggalRaw: ts,
        tanggal: ts ? fmtDate(d) : "",
        deskripsi: String(row[2] || ""),
        total: 0
      };
    }
    poAgg[po].total += Number(row[7]) || 0;
  });
  Object.keys(poAgg).forEach(function(po) {
    const a = poAgg[po];
    if (!a.tanggalRaw) return;
    items.push({
      tanggalRaw: a.tanggalRaw,
      tanggal: a.tanggal,
      jenis: "Pembelian",
      ref: po,
      deskripsi: a.deskripsi,
      nominal: a.total,
      posted: true,
      menu: "loadPurchaseOrderPage"
    });
  });

  for (let k = mutasi.length - 1; k >= 0 && items.length < cap * 3; k--) {
    const d = mutasi[k][0] instanceof Date ? mutasi[k][0] : new Date(mutasi[k][0]);
    if (isNaN(d.getTime())) continue;
    items.push({
      tanggalRaw: d.getTime(),
      tanggal: fmtDate(d),
      jenis: "Mutasi",
      ref: String(mutasi[k][8] || ""),
      deskripsi: String(mutasi[k][3] || "") + " → " + String(mutasi[k][4] || ""),
      nominal: Number(mutasi[k][5]) || 0,
      posted: mutasi[k][7] === true || String(mutasi[k][7]).toUpperCase() === "TRUE",
      menu: "loadMutasiPage"
    });
  }

  const groups = {};
  jurnal.forEach(function(row) {
    const rawDate = row[0];
    if (!rawDate) return;
    const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (isNaN(d.getTime())) return;
    const transId = String(row[7] || "").trim();
    if (!transId) return;
    if (!groups[transId]) {
      groups[transId] = {
        tanggalRaw: d.getTime(),
        tanggal: fmtDate(d),
        jenis: "Jurnal",
        ref: String(row[1] || "").trim() || transId,
        deskripsi: String(row[5] || "").trim() || "Jurnal manual",
        nominal: 0,
        posted: row[6] === true || String(row[6]).toUpperCase() === "TRUE",
        menu: "loadJurnalManualPage"
      };
    }
    groups[transId].nominal += Number(row[3]) || 0;
    if (row[6] !== true && String(row[6]).toUpperCase() !== "TRUE") {
      groups[transId].posted = false;
    }
  });
  Object.keys(groups).forEach(function(k) { items.push(groups[k]); });

  items.sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
  return items.slice(0, cap);
}

function dashResolvePeriodFast_(bulan, tahun) {
  let m = Number(bulan);
  let y = Number(tahun);
  if (!(m >= 1 && m <= 12) || !(y >= 2000)) {
    const now = new Date();
    m = now.getMonth() + 1;
    y = now.getFullYear();
  }
  return { bulan: m, tahun: y };
}

function dashKeuanganCacheKey_(bulan, tahun) {
  return "dash_keu_" + bulan + "_" + tahun;
}

function dashClearKeuanganCache_() {
  try {
    const cache = CacheService.getScriptCache();
    const yNow = new Date().getFullYear();
    for (let y = yNow - 1; y <= yNow + 1; y++) {
      for (let m = 1; m <= 12; m++) {
        cache.remove(dashKeuanganCacheKey_(m, y));
      }
    }
  } catch (ignore) {}
}

function dashFindSheetAmount_(sh, labels) {
  if (!sh || sh.getLastRow() < 2) return 0;
  const maxRows = Math.min(sh.getLastRow(), 120);
  const matrix = sh.getRange(1, 1, maxRows, 3).getDisplayValues();
  const patterns = labels.map(function(l) { return String(l).toLowerCase(); });
  for (let r = 0; r < matrix.length; r++) {
    const rowText = String(matrix[r][0] || "").trim().toLowerCase();
    for (let i = 0; i < patterns.length; i++) {
      if (rowText === patterns[i] || rowText.indexOf(patterns[i]) >= 0) {
        return dashParseMoney_(matrix[r][2]);
      }
    }
  }
  return 0;
}

function dashSumPemasukan_(ss, bulan, tahun) {
  const sh = ss.getSheetByName("PEMASUKAN");
  if (!sh || sh.getLastRow() < 2) {
    return { penjualan: 0, piutangBaru: 0, invoiceCount: 0 };
  }
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 19).getValues();
  let penjualan = 0;
  let piutangBaru = 0;
  const invoices = {};
  data.forEach(function(row) {
    if (!dashIsInPeriod_(row[1], bulan, tahun)) return;
    penjualan += Number(row[11]) || 0;
    piutangBaru += Number(row[13]) || 0;
    const inv = String(row[4] || "").trim();
    if (inv) invoices[inv] = true;
  });
  return {
    penjualan: penjualan,
    piutangBaru: piutangBaru,
    invoiceCount: Object.keys(invoices).length
  };
}

function dashSumPembelian_(ss, bulan, tahun) {
  const sh = ss.getSheetByName("PEMBELIAN");
  if (!sh || sh.getLastRow() < 2) return 0;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 18).getValues();
  let total = 0;
  data.forEach(function(row) {
    if (!dashIsInPeriod_(row[0], bulan, tahun)) return;
    total += Number(row[7]) || 0;
  });
  return total;
}

function dashTotalPiutang_() {
  const list = getDaftarPiutang(null, null, "all");
  let total = 0;
  list.forEach(function(r) { total += Number(r.sisaTagihan) || 0; });
  return { total: total, count: list.length, top: list.slice(0, 5) };
}

function dashTotalHutang_() {
  const list = getDaftarHutang(null, null, "all");
  let total = 0;
  list.forEach(function(r) { total += Number(r.sisaTagihan) || 0; });
  return { total: total, count: list.length, top: list.slice(0, 5) };
}

function dashKasTotal_() {
  const saldo = getSaldoKasBank();
  let total = 0;
  Object.keys(saldo).forEach(function(k) { total += Number(saldo[k]) || 0; });
  return total;
}

function dashChartMonths_(bulan, tahun, count) {
  const out = [];
  let m = Number(bulan);
  let y = Number(tahun);
  const names = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  for (let i = count - 1; i >= 0; i--) {
    let mm = m - i;
    let yy = y;
    while (mm < 1) { mm += 12; yy -= 1; }
    out.push({ bulan: mm, tahun: yy, label: names[mm] + " " + String(yy).slice(-2) });
  }
  return out;
}

function dashBuildCharts_(ss, bulan, tahun) {
  return dashChartMonths_(bulan, tahun, 6).map(function(per) {
    return {
      label: per.label,
      penjualan: dashSumPemasukan_(ss, per.bulan, per.tahun).penjualan,
      pembelian: dashSumPembelian_(ss, per.bulan, per.tahun)
    };
  });
}

function dashReadKeuanganBackend_(bulan, tahun, skipCache) {
  const empty = {
    available: false,
    totalAset: 0,
    totalPassiva: 0,
    selisihNeraca: 0,
    jumlahPendapatan: 0,
    jumlahHpp: 0,
    labaKotor: 0,
    labaBersih: 0
  };
  const m = Number(bulan);
  const y = Number(tahun);
  const cacheKey = dashKeuanganCacheKey_(m, y);

  if (!skipCache) {
    try {
      const cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (ignore) {}
  }

  try {
    const ss = openBackendSpreadsheet_();
    ensureBackendLaporanConfig_(ss);
    const cfg = ss.getSheetByName("LAPORAN_CONFIG");
    const cur = readBackendReportPeriod_(ss);
    const periodChanged = cur.bulan !== m || cur.tahun !== y;

    if (periodChanged) {
      cfg.getRange(2, 2).setValue(m);
      cfg.getRange(3, 2).setValue(y);
      forceBackendLaporanRecalc_(ss, true);
    }

    const neraca = ss.getSheetByName("NERACA");
    const lr = ss.getSheetByName("LABA_RUGI");
    if (!neraca || !lr) return empty;

    const result = {
      available: true,
      totalAset: dashFindSheetAmount_(neraca, ["total aset"]),
      totalPassiva: dashFindSheetAmount_(neraca, ["total liabilitas dan ekuitas"]),
      selisihNeraca: dashFindSheetAmount_(neraca, ["selisih neraca"]),
      jumlahPendapatan: dashFindSheetAmount_(lr, ["jumlah pendapatan"]),
      jumlahHpp: dashFindSheetAmount_(lr, ["jumlah hpp"]),
      labaKotor: dashFindSheetAmount_(lr, ["laba kotor"]),
      labaBersih: dashFindSheetAmount_(lr, ["laba bersih"])
    };

    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 180);
    } catch (ignore) {}

    return result;
  } catch (e) {
    return Object.assign({}, empty, { error: String(e.message || e) });
  }
}

function dashCollectActivities_(ss, limit) {
  const items = [];
  const tz = Session.getScriptTimeZone();
  const fmtDate = function(d) {
    return Utilities.formatDate(d, tz, "dd/MM/yyyy");
  };
  const push = function(obj) { items.push(obj); };

  const shP = ss.getSheetByName("PEMASUKAN");
  if (shP && shP.getLastRow() >= 2) {
    const data = shP.getRange(2, 1, shP.getLastRow() - 1, 19).getValues();
    const seen = {};
    for (let i = data.length - 1; i >= 0; i--) {
      const inv = String(data[i][4] || "").trim();
      if (!inv || seen[inv]) continue;
      seen[inv] = true;
      const d = data[i][1] instanceof Date ? data[i][1] : new Date(data[i][1]);
      if (isNaN(d.getTime())) continue;
      let total = 0;
      let posted = false;
      data.forEach(function(r) {
        if (String(r[4] || "").trim() !== inv) return;
        total += Number(r[11]) || 0;
        if (String(r[18] || "").toUpperCase() === "POSTED") posted = true;
      });
      push({
        tanggalRaw: d.getTime(),
        tanggal: fmtDate(d),
        jenis: "Penjualan",
        ref: inv,
        deskripsi: String(data[i][5] || ""),
        nominal: total,
        posted: posted,
        menu: "loadInvoiceHistoryPage"
      });
    }
  }

  const shB = ss.getSheetByName("PEMBELIAN");
  if (shB && shB.getLastRow() >= 2) {
    const data = shB.getRange(2, 1, shB.getLastRow() - 1, 18).getValues();
    const seen = {};
    for (let j = data.length - 1; j >= 0; j--) {
      const po = String(data[j][1] || "").trim();
      if (!po || seen[po]) continue;
      seen[po] = true;
      const d = data[j][0] instanceof Date ? data[j][0] : new Date(data[j][0]);
      if (isNaN(d.getTime())) continue;
      let total = 0;
      data.forEach(function(r) {
        if (String(r[1] || "").trim() === po) total += Number(r[7]) || 0;
      });
      push({
        tanggalRaw: d.getTime(),
        tanggal: fmtDate(d),
        jenis: "Pembelian",
        ref: po,
        deskripsi: String(data[j][2] || ""),
        nominal: total,
        posted: true,
        menu: "loadPurchaseOrderPage"
      });
    }
  }

  const shM = ss.getSheetByName("MUTASI_DANA");
  if (shM && shM.getLastRow() >= 2) {
    const data = shM.getRange(2, 1, shM.getLastRow() - 1, 9).getValues();
    for (let k = data.length - 1; k >= 0; k--) {
      const d = data[k][0] instanceof Date ? data[k][0] : new Date(data[k][0]);
      if (isNaN(d.getTime())) continue;
      push({
        tanggalRaw: d.getTime(),
        tanggal: fmtDate(d),
        jenis: "Mutasi",
        ref: String(data[k][8] || ""),
        deskripsi: String(data[k][3] || "") + " → " + String(data[k][4] || ""),
        nominal: Number(data[k][5]) || 0,
        posted: data[k][7] === true || String(data[k][7]).toUpperCase() === "TRUE",
        menu: "loadMutasiPage"
      });
    }
  }

  try {
    getManualJournalHistory(null, null).slice(0, 20).forEach(function(j) {
      push({
        tanggalRaw: j.tanggalRaw,
        tanggal: j.tanggal,
        jenis: "Jurnal",
        ref: j.noBukti || j.transactionId,
        deskripsi: j.keterangan || "Jurnal manual",
        nominal: j.totalDebit,
        posted: j.isPosted,
        menu: "loadJurnalManualPage"
      });
    });
  } catch (ignore) {}

  items.sort(function(a, b) { return b.tanggalRaw - a.tanggalRaw; });
  return items.slice(0, limit || 15);
}

function dashBuildAlertsOps_(payload) {
  const alerts = [];
  if (payload.piutang && payload.piutang.total > 0) {
    alerts.push({
      level: "warn",
      text: "Piutang outstanding " + payload.piutang.count + " invoice — total belum tertagih."
    });
  }
  if (payload.hutang && payload.hutang.total > 0) {
    alerts.push({
      level: "warn",
      text: "Hutang outstanding " + payload.hutang.count + " PO — perlu pelunasan."
    });
  }
  if (payload.quotationAktif > 0) {
    alerts.push({
      level: "info",
      text: payload.quotationAktif + " quotation aktif menunggu konversi ke invoice."
    });
  }
  const unposted = (payload.aktivitas || []).filter(function(a) { return !a.posted; }).length;
  if (unposted > 0) {
    alerts.push({
      level: "warn",
      text: unposted + " transaksi terbaru belum POSTED ke jurnal backend."
    });
  }
  return alerts;
}

function dashBuildAlertsKeu_(keuangan) {
  const alerts = [];
  const k = keuangan || {};
  if (k.available && Math.abs(k.selisihNeraca) > 1) {
    alerts.push({
      level: "error",
      text: "Neraca tidak balance — selisih " + Math.round(k.selisihNeraca).toLocaleString("id-ID") + ". Periksa jurnal & laporan."
    });
  }
  if (k.error) {
    alerts.push({ level: "warn", text: "Laporan backend: " + k.error });
  }
  return alerts;
}

function dashBuildOpsPayload_(ss, m, y) {
  const pemasukan = dashReadSheet_(ss, "PEMASUKAN", 19);
  const pembelian = dashReadSheet_(ss, "PEMBELIAN", 18);
  const mutasi = dashReadSheet_(ss, "MUTASI_DANA", 9);
  const jurnal = dashReadSheet_(ss, "JURNAL_MANUAL", 8);
  const quotation = dashReadSheet_(ss, "QUOTATION", 13);

  const ops = dashOpsFromPemasukan_(pemasukan, m, y);
  const piutang = dashPiutangFromPemasukan_(pemasukan);
  const hutang = dashHutangFromPembelian_(pembelian);
  const quotationAktif = dashQuotationCount_(quotation);

  const payload = {
    periode: { bulan: m, tahun: y },
    kpi: {
      penjualan: ops.penjualan,
      pembelian: dashPembelianFromData_(pembelian, m, y),
      labaBersih: null,
      kasTotal: dashKasFromMutasi_(ss, mutasi),
      piutang: piutang.total,
      hutang: hutang.total,
      margin: null,
      invoiceCount: ops.invoiceCount,
      quotationAktif: quotationAktif
    },
    charts: {
      bulanan: dashChartsFromData_(pemasukan, pembelian, m, y)
    },
    piutang: piutang,
    hutang: hutang,
    aktivitas: dashActivitiesFromData_(pemasukan, pembelian, mutasi, jurnal, 15),
    quotationAktif: quotationAktif,
    keuanganPending: true
  };
  payload.alerts = dashBuildAlertsOps_(payload);
  return payload;
}

function getDashboardV2Ops(bulan, tahun) {
  authGuard_();
  const periode = dashResolvePeriodFast_(bulan, tahun);
  const ss = getDatabaseSpreadsheet_();
  return dashBuildOpsPayload_(ss, periode.bulan, periode.tahun);
}

function getDashboardV2Keuangan(bulan, tahun, forceRefresh) {
  authGuard_();
  const periode = dashResolvePeriodFast_(bulan, tahun);
  const m = periode.bulan;
  const y = periode.tahun;
  const keuangan = dashReadKeuanganBackend_(m, y, !!forceRefresh);
  const margin = keuangan.jumlahPendapatan > 0
    ? Math.round((keuangan.labaKotor / keuangan.jumlahPendapatan) * 1000) / 10
    : 0;
  return {
    periode: { bulan: m, tahun: y },
    keuangan: keuangan,
    kpi: {
      labaBersih: keuangan.labaBersih,
      margin: margin
    },
    alerts: dashBuildAlertsKeu_(keuangan)
  };
}

function getDashboardV2(bulan, tahun) {
  authGuard_();
  const periode = dashResolvePeriodFast_(bulan, tahun);
  const ss = getDatabaseSpreadsheet_();
  const payload = dashBuildOpsPayload_(ss, periode.bulan, periode.tahun);
  const keu = getDashboardV2Keuangan(periode.bulan, periode.tahun, false);
  payload.keuangan = keu.keuangan;
  payload.kpi.labaBersih = keu.kpi.labaBersih;
  payload.kpi.margin = keu.kpi.margin;
  payload.keuanganPending = false;
  payload.alerts = payload.alerts.concat(keu.alerts || []);
  return payload;
}

function getDashboardSummary(periode) {
  authGuard_();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();

  let totalPenjualan = 0;
  let invoiceSet = new Set();
  let customerSet = new Set();
  let totalPiutang = 0;

  for (let i = 1; i < data.length; i++) {
    const tanggal = new Date(data[i][1]);
    let include = false;

    if (periode === "all") include = true;
    if (periode === "today" && tanggal.toDateString() === today.toDateString()) include = true;
    if (periode === "month" && tanggal.getMonth() === currentMonth && tanggal.getFullYear() === currentYear) include = true;
    if (periode === "year" && tanggal.getFullYear() === currentYear) include = true;

    if (!include) continue;

    totalPenjualan += Number(data[i][11]) || 0;
    invoiceSet.add(data[i][4]);
    customerSet.add(data[i][5]);
    totalPiutang += Number(data[i][13]) || 0;
  }

  return {
    totalPenjualan,
    totalInvoice: invoiceSet.size,
    totalCustomer: customerSet.size,
    totalPiutang
  };
}

function getSalesChartData(periode) {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const bulanOrder = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const sales = {};
  bulanOrder.forEach(bulan => { sales[bulan] = 0; });

  for (let i = 1; i < data.length; i++) {
    const tanggal = new Date(data[i][1]);
    const bulan = data[i][2];
    const total = Number(data[i][11]) || 0;
    let include = false;

    if (periode === "all") include = true;
    if (periode === "today" && tanggal.toDateString() === today.toDateString()) include = true;
    if (periode === "month" && tanggal.getMonth() === currentMonth && tanggal.getFullYear() === currentYear) include = true;
    if (periode === "year" && tanggal.getFullYear() === currentYear) include = true;

    if (!include) continue;

    if (sales.hasOwnProperty(bulan)) {
      sales[bulan] += total;
    }
  }

  return bulanOrder.map(bulan => ({
    bulan: bulan,
    total: sales[bulan]
  }));
}

function getRecentTransactions() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName("PEMASUKAN");
  const data = sh.getDataRange().getValues();
  const result = [];

  for (let i = data.length - 1; i >= 1; i--) {
    result.push({
      tanggal: Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), "dd/MM/yyyy"),
      invoice: String(data[i][4]),
      customer: String(data[i][5]),
      keterangan: String(data[i][6]),
      total: Number(data[i][11]) || 0
    });
    if (result.length >= 10) break;
  }
  return result;
}
