/**
 * CARA PAKAI (DevTools Console, tab production yang sudah login):
 * 1. Buka file ini di Cursor/editor → Select All (Cmd+A) → Copy (Cmd+C)
 * 2. Paste di Console → Enter
 * JANGAN paste path file (/Users/...) — itu bukan JavaScript!
 */
(async function browserUiCheck() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  console.log("🧪 Browser UI Check — mulai…");

  // Sidebar scroll test
  const sidebar = document.querySelector(".sidebar");
  const laporanMenu = document.querySelector('.menu-item[data-menu="laporan"]');
  let sidebarScrollOk = false;
  if (sidebar && laporanMenu) {
    sidebar.scrollTop = sidebar.scrollHeight;
    await sleep(300);
    const rect = laporanMenu.getBoundingClientRect();
    sidebarScrollOk = rect.top >= 0 && rect.bottom <= window.innerHeight;
  }
  results.push({
    test: "Sidebar scroll → Laporan terlihat",
    pass: sidebarScrollOk,
    note: sidebarScrollOk ? "OK" : "Menu Laporan mungkin terpotong — sidebar tidak scroll",
  });

  for (const m of menus) {
    if (typeof window[m.fn] !== "function") {
      results.push({ test: m.title, pass: false, note: "Fungsi " + m.fn + " tidak ditemukan" });
      continue;
    }
    window[m.fn]();
    await sleep(m.wait);
    const main = document.getElementById("mainContent");
    const text = main ? main.innerText : "";
    const hasTitle = text.indexOf(m.title) >= 0;
    const hasError =
      text.indexOf("Gagal memuat") >= 0 ||
      text.indexOf("Error:") >= 0 ||
      (text.indexOf("Memuat") >= 0 && m.fn !== "loadDashboardPage" && m.fn !== "loadLaporanPage");
    const pass = hasTitle && !hasError;
    results.push({
      test: m.title,
      pass: pass,
      note: !hasTitle ? "Judul tidak ditemukan" : hasError ? "Masih loading/error" : "OK",
    });
  }

  // Laporan tabs
  if (typeof switchLaporanTab === "function") {
    for (const tab of ["neraca", "labaRugi", "arusKas"]) {
      switchLaporanTab(tab);
      await sleep(3500);
      const lap = document.getElementById("laporanContainer");
      const lapText = lap ? lap.innerText : "";
      const err = lapText.indexOf("color:#dc2626") >= 0 || lapText.indexOf("Gagal") >= 0;
      const empty = lapText.indexOf("Tidak ada data") >= 0;
      results.push({
        test: "Laporan tab " + tab,
        pass: !err,
        note: err ? "Error load" : empty ? "Kosong (OK struktural)" : "Data tampil",
      });
    }
  }

  // Mobile viewport simulation
  const origW = window.innerWidth;
  const mobileNote = origW <= 700 ? "viewport sudah mobile" : "desktop — resize manual untuk 375px";
  results.push({
    test: "Viewport info",
    pass: true,
    note: origW + "px · " + mobileNote,
  });

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log("\n=== HASIL BROWSER UI CHECK ===");
  console.table(results);
  console.log("\n📊 " + passed + "/" + total + " PASS");
  return { passed, total, results };
})();
