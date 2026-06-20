/** Mock google.script.run — hanya aktif di localhost (Design Mode / preview UI). */
(function () {
  if (!/localhost|127\.0\.0\.1/.test(location.hostname)) return;

  function runChain() {
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
            var mock = {
              getSessionUser: {
                ok: true,
                user: { nama: "Preview Owner", email: "preview@local.dev", role: "owner", roleLabel: "Owner" },
                menus: null
              },
              warmUpSession: { ok: true },
              getDashboardV2Ops: {
                periode: { bulan: 6, tahun: 2025 },
                omzet: 128000000,
                transaksi: 42,
                piutang: 8500000,
                hutang: 3200000,
                recentInvoices: []
              },
              getDashboardV2Keuangan: {
                labaBersih: 24000000,
                omzet: 128000000,
                beban: 104000000
              }
            };
            ok(mock[method] !== undefined ? mock[method] : {});
          }, 60);
        };
      }
    });
  }

  window.google = { script: { run: runChain() } };
  console.info("[UI Preview] google.script.run dimock — untuk Design Mode lokal.");
})();
