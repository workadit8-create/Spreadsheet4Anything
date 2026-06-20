/** Mock google.script.run — hanya aktif di localhost (Design Mode / preview UI). */
(function () {
  if (!/localhost|127\.0\.0\.1/.test(location.hostname)) return;

  var PREVIEW_DASH_OPS = {
    periode: { bulan: new Date().getMonth() + 1, tahun: new Date().getFullYear() },
    kpi: {
      penjualan: 45000000,
      pembelian: 28000000,
      labaBersih: null,
      kasTotal: 125000000,
      piutang: 8500000,
      hutang: 3200000,
      margin: null,
      invoiceCount: 12,
      quotationAktif: 3
    },
    piutang: { total: 8500000, count: 2, top: [] },
    hutang: { total: 3200000, count: 1, top: [] },
    charts: {
      bulanan: [
        { label: "Jan", penjualan: 32000000, pembelian: 18000000 },
        { label: "Feb", penjualan: 28000000, pembelian: 22000000 },
        { label: "Mar", penjualan: 35000000, pembelian: 19000000 },
        { label: "Apr", penjualan: 41000000, pembelian: 25000000 },
        { label: "Mei", penjualan: 38000000, pembelian: 21000000 },
        { label: "Jun", penjualan: 45000000, pembelian: 28000000 }
      ]
    },
    aktivitas: [
      { tanggal: "20/06/2025", jenis: "Penjualan", ref: "INV-20250620-0001-TC", deskripsi: "Preview customer", nominal: 2500000, posted: true, menu: "loadInvoiceBaruPage" },
      { tanggal: "19/06/2025", jenis: "Pembelian", ref: "PO-250620-1234", deskripsi: "Preview supplier", nominal: 1800000, posted: false, menu: "loadPembelianPage" }
    ],
    alerts: [{ level: "info", text: "Mode preview UI — data dummy untuk Design Mode." }],
    keuanganPending: true
  };

  var PREVIEW_DASH_KEU = {
    keuangan: { available: false, error: "Preview lokal — deploy ke GAS untuk snapshot backend" },
    kpi: { labaBersih: 8500000, margin: 18.9 },
    alerts: []
  };

  var HANDLERS = {
    getSessionUser: {
      ok: true,
      user: { nama: "Preview Owner", email: "preview@local.dev", role: "owner", roleLabel: "Owner" },
      menus: null
    },
    warmUpSession: { ok: true },
    getDashboardV2Ops: PREVIEW_DASH_OPS,
    getDashboardV2Keuangan: PREVIEW_DASH_KEU,
    getSettings: {}
  };

  function createRunChain() {
    var ok = function () {};
    var chain = {
      withSuccessHandler: function (fn) {
        ok = fn;
        return chain;
      },
      withFailureHandler: function () {
        return chain;
      }
    };
    return new Proxy(chain, {
      get: function (t, method) {
        if (method in t) return t[method];
        return function () {
          setTimeout(function () {
            ok(HANDLERS[method] !== undefined ? HANDLERS[method] : {});
          }, 40);
        };
      }
    });
  }

  window.previewDashOps_ = function () {
    var now = new Date();
    var m = now.getMonth() + 1;
    var y = now.getFullYear();
    var bulanEl = document.getElementById("dashBulan");
    var tahunEl = document.getElementById("dashTahun");
    if (bulanEl && bulanEl.value) m = Number(bulanEl.value);
    if (tahunEl && tahunEl.value) y = Number(tahunEl.value);
    var d = JSON.parse(JSON.stringify(PREVIEW_DASH_OPS));
    d.periode = { bulan: m, tahun: y };
    return d;
  };
  window.previewDashKeu_ = function () {
    return PREVIEW_DASH_KEU;
  };

  window.google = {
    script: {
      get run() {
        return createRunChain();
      }
    }
  };
  console.info("[UI Preview] google.script.run dimock — dashboard dummy data.");
})();
