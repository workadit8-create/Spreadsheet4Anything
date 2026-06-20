/**
 * CARA PAKAI (DevTools Console, tab production yang sudah login):
 * 1. Cmd+A → Cmd+C isi file ini (JANGAN paste path file!)
 * 2. Paste di Console → Enter
 * 3. Jika 0/16: dropdown Console pilih frame "googleusercontent.com" lalu jalankan lagi
 */
(async function browserUiCheck() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findAppWindow(win, depth) {
    if (!win || depth > 6) return null;
    try {
      if (typeof win.loadDashboardPage === "function") return win;
    } catch (e) {}
    try {
      const frames = win.frames;
      for (let i = 0; i < frames.length; i++) {
        const hit = findAppWindow(frames[i], depth + 1);
        if (hit) return hit;
      }
    } catch (e) {}
    try {
      const iframes = win.document.querySelectorAll("iframe");
      for (let i = 0; i < iframes.length; i++) {
        const hit = findAppWindow(iframes[i].contentWindow, depth + 1);
        if (hit) return hit;
      }
    } catch (e) {}
    return null;
  }

  const appWin = findAppWindow(window, 0);
  if (!appWin) {
    console.error(
      "Fungsi loadDashboardPage tidak ditemukan di frame ini.\n" +
        "Solusi: DevTools → Console → dropdown 'top' → pilih frame googleusercontent.com\n" +
        "Lalu paste & jalankan script lagi."
    );
    return { error: "wrong_frame", passed: 0, total: 0, results: [] };
  }

  const doc = appWin.document;
  console.log("Browser UI Check — frame app ditemukan:", appWin.location.href);

  const menus = [
    { fn: "loadDashboardPage", title: "Dashboard", wait: 4000 },
    { fn: "loadMutasiPage", title: "Kas & Bank", wait: 2500 },
    { fn: "loadQuotationPage", title: "Quotation", wait: 2500 },
    { fn: "loadPemasukanPage", title: "Pemasukan", wait: 2000 },
    { fn: "loadInvoiceHistoryPage", title: "Riwayat Invoice", wait: 3000 },
    { fn: "loadPiutangPage", title: "Daftar Piutang", wait: 3000 },
    { fn: "loadPurchaseRequestPage", title: "Purchase Request", wait: 2500 },
    { fn: "loadPembelianPage", title: "Pembelian Barang", wait: 2000 },
    { fn: "loadPurchaseOrderPage", title: "Purchase Order", wait: 3000 },
    { fn: "loadHutangPage", title: "Daftar Hutang", wait: 3000 },
    { fn: "loadJurnalManualPage", title: "Jurnal Manual", wait: 2500 },
    { fn: "loadPostingJurnalPage", title: "Posting Jurnal", wait: 3500 },
    { fn: "loadMasterDataPage", title: "Master Data", wait: 3500 },
    { fn: "loadSettingsPage", title: "Pengaturan", wait: 2000 },
    { fn: "loadLaporanPage", title: "Laporan Keuangan", wait: 5000 },
  ];

  const results = [];

  const sidebar = doc.querySelector(".sidebar");
  const laporanMenu = doc.querySelector('.menu-item[data-menu="laporan"]');
  let sidebarScrollOk = false;
  if (sidebar && laporanMenu) {
    sidebar.scrollTop = sidebar.scrollHeight;
    await sleep(300);
    const rect = laporanMenu.getBoundingClientRect();
    sidebarScrollOk = rect.top >= 0 && rect.bottom <= appWin.innerHeight;
  }
  results.push({
    test: "Sidebar scroll → Laporan",
    pass: sidebarScrollOk,
    note: sidebarScrollOk ? "OK" : "Menu terpotong / sidebar tidak scroll",
  });

  for (const m of menus) {
    if (typeof appWin[m.fn] !== "function") {
      results.push({ test: m.title, pass: false, note: m.fn + " tidak ditemukan" });
      continue;
    }
    appWin[m.fn]();
    await sleep(m.wait);
    const main = doc.getElementById("mainContent");
    const text = main ? main.innerText : "";
    const hasTitle = text.indexOf(m.title) >= 0;
    const hasError =
      text.indexOf("Gagal memuat") >= 0 ||
      text.indexOf("Error:") >= 0 ||
      (text.indexOf("Memuat") >= 0 && m.fn !== "loadDashboardPage" && m.fn !== "loadLaporanPage");
    results.push({
      test: m.title,
      pass: hasTitle && !hasError,
      note: !hasTitle ? "Judul tidak ditemukan" : hasError ? "Loading/error" : "OK",
    });
  }

  if (typeof appWin.switchLaporanTab === "function") {
    for (const tab of ["neraca", "labaRugi", "arusKas"]) {
      appWin.switchLaporanTab(tab);
      await sleep(3500);
      const lap = doc.getElementById("laporanContainer");
      const lapText = lap ? lap.innerText : "";
      const err = lapText.indexOf("Gagal") >= 0;
      results.push({
        test: "Laporan tab " + tab,
        pass: !err,
        note: err ? "Error load" : lapText.indexOf("Tidak ada data") >= 0 ? "Kosong (OK)" : "Data tampil",
      });
    }
  }

  results.push({
    test: "Viewport",
    pass: true,
    note: appWin.innerWidth + "px",
  });

  const passed = results.filter((r) => r.pass).length;
  console.log("\n=== HASIL BROWSER UI CHECK ===");
  console.table(results);
  console.log("\n" + passed + "/" + results.length + " PASS");
  return { passed, total: results.length, results };
})();
