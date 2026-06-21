// Sumber Dana Purchasing — SD + alokasi FIFO / multi-SD
// ==========================================

var SD_STATUS_AKTIF_ = "Aktif";
var SD_STATUS_HABIS_ = "Habis";

function ensureSumberDanaSheet_(ss) {
  let sh = ss.getSheetByName("SUMBER_DANA");
  if (!sh) {
    sh = ss.insertSheet("SUMBER_DANA");
    sh.appendRow([
      "SD_ID", "Tanggal", "Mutasi_ID", "Rekening", "Nominal_awal",
      "Untuk_pembelian", "Petugas", "Status", "Keterangan_mutasi"
    ]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureSdAlokasiSheet_(ss) {
  let sh = ss.getSheetByName("SD_ALOKASI");
  if (!sh) {
    sh = ss.insertSheet("SD_ALOKASI");
    sh.appendRow([
      "Alokasi_ID", "SD_ID", "Jenis", "Ref_No", "Tanggal", "Nominal",
      "Untuk_pembelian", "Petugas"
    ]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureSumberDanaSheets_(ss) {
  ensureSumberDanaSheet_(ss);
  ensureSdAlokasiSheet_(ss);
}

function generateSdId_(tanggal) {
  const ss = getDatabaseSpreadsheet_();
  ensureSumberDanaSheet_(ss);
  const sh = ss.getSheetByName("SUMBER_DANA");
  const tz = Session.getScriptTimeZone();
  const d = tanggal ? new Date(tanggal) : new Date();
  const dateStr = Utilities.formatDate(d, tz, "yyMMdd");
  const prefix = "SD-" + dateStr + "-";
  let maxSeq = 0;
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      const id = String(r[0] || "");
      if (id.indexOf(prefix) === 0) {
        const n = parseInt(id.substring(prefix.length), 10);
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      }
    });
  }
  return prefix + String(maxSeq + 1).padStart(4, "0");
}

function buildSdTerpakaiMap_(ss) {
  ensureSdAlokasiSheet_(ss);
  const sh = ss.getSheetByName("SD_ALOKASI");
  const map = {};
  if (sh.getLastRow() < 2) return map;
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const sdId = String(data[i][1] || "").trim();
    const nominal = Number(data[i][5]) || 0;
    if (!sdId || nominal <= 0) continue;
    map[sdId] = (map[sdId] || 0) + nominal;
  }
  return map;
}

function readSumberDanaRows_(ss, activeOnly) {
  ensureSumberDanaSheets_(ss);
  const sh = ss.getSheetByName("SUMBER_DANA");
  if (sh.getLastRow() < 2) return [];
  const terpakai = buildSdTerpakaiMap_(ss);
  const rows = [];
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const sdId = String(data[i][0] || "").trim();
    if (!sdId) continue;
    const nominalAwal = Number(data[i][4]) || 0;
    const terpakaiNom = terpakai[sdId] || 0;
    const sisa = Math.max(0, nominalAwal - terpakaiNom);
    const status = String(data[i][7] || SD_STATUS_AKTIF_).trim();
    if (activeOnly && status !== SD_STATUS_AKTIF_) continue;
    if (activeOnly && sisa <= 0.0001) continue;
    if (activeOnly && status === SD_STATUS_HABIS_) continue;
    rows.push({
      sdId: sdId,
      tanggal: data[i][1],
      mutasiId: String(data[i][2] || ""),
      rekening: String(data[i][3] || ""),
      nominalAwal: nominalAwal,
      terpakai: terpakaiNom,
      sisa: sisa,
      untukPembelian: String(data[i][5] || ""),
      petugas: String(data[i][6] || ""),
      status: status,
      keteranganMutasi: String(data[i][8] || ""),
      rowIndex: i + 1
    });
  }
  return rows;
}

function formatSdLabel_(row) {
  return row.sdId + " - Rp " + formatNumberId_(row.sisa) + " - " + row.untukPembelian + " - " + row.petugas;
}

function formatNumberId_(n) {
  return Math.round(Number(n) || 0).toLocaleString("id-ID");
}

function sortSdFifo_(rows) {
  return rows.slice().sort(function(a, b) {
    const ta = new Date(a.tanggal).getTime();
    const tb = new Date(b.tanggal).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.sdId).localeCompare(String(b.sdId));
  });
}

function allocateSdFifo_(ss, nominal, rekeningFilter) {
  const amount = Number(nominal) || 0;
  if (amount <= 0) return { alokasi: [], total: 0, rekening: "" };

  let pool = readSumberDanaRows_(ss, true);
  if (rekeningFilter) {
    const rek = String(rekeningFilter).trim();
    pool = pool.filter(function(r) { return r.rekening === rek; });
  }
  pool = sortSdFifo_(pool);

  let remaining = amount;
  const alokasi = [];
  let rekening = "";

  pool.forEach(function(row) {
    if (remaining <= 0.0001) return;
    const take = Math.min(remaining, row.sisa);
    if (take <= 0.0001) return;
    alokasi.push({
      sdId: row.sdId,
      nominal: take,
      sisaSebelum: row.sisa,
      rekening: row.rekening,
      untukPembelian: row.untukPembelian,
      petugas: row.petugas,
      label: formatSdLabel_(row)
    });
    if (!rekening) rekening = row.rekening;
    remaining -= take;
  });

  if (remaining > 0.0001) {
    const tersedia = amount - remaining;
    throw new Error(
      "Sisa sumber dana tidak cukup. Tersedia Rp " + formatNumberId_(tersedia) +
      ", butuh Rp " + formatNumberId_(amount) + "."
    );
  }

  return { alokasi: alokasi, total: amount, rekening: rekening };
}

function previewSdAllocationFifo(nominal, rekeningFilter) {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  ensureSumberDanaSheets_(ss);
  try {
    const result = allocateSdFifo_(ss, nominal, rekeningFilter || "");
    result.alokasi = result.alokasi.map(function(a) {
      return {
        sdId: a.sdId,
        nominal: a.nominal,
        rekening: a.rekening,
        label: a.label,
        untukPembelian: a.untukPembelian,
        petugas: a.petugas
      };
    });
    return result;
  } catch (err) {
    return { error: err.message, alokasi: [], total: 0, rekening: "" };
  }
}

function getSumberDanaAktif() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  ensureSumberDanaSheets_(ss);
  return readSumberDanaRows_(ss, true).map(function(row) {
    return {
      sdId: row.sdId,
      sisa: row.sisa,
      nominalAwal: row.nominalAwal,
      terpakai: row.terpakai,
      rekening: row.rekening,
      untukPembelian: row.untukPembelian,
      petugas: row.petugas,
      label: formatSdLabel_(row),
      tanggal: row.tanggal instanceof Date
        ? Utilities.formatDate(row.tanggal, Session.getScriptTimeZone(), "dd/MM/yyyy")
        : String(row.tanggal || "")
    };
  });
}

function getSumberDanaDashboard() {
  authGuard_();
  const ss = getDatabaseSpreadsheet_();
  const rows = readSumberDanaRows_(ss, false);
  let outstanding = 0;
  const aktif = [];
  rows.forEach(function(row) {
    const sisaLive = row.sisa;
    if (sisaLive <= 0.0001) return;
    if (row.status === SD_STATUS_HABIS_) return;
    outstanding += row.sisa;
    aktif.push({
      sdId: row.sdId,
      sisa: row.sisa,
      nominalAwal: row.nominalAwal,
      terpakai: row.terpakai,
      untukPembelian: row.untukPembelian,
      petugas: row.petugas,
      rekening: row.rekening,
      status: row.status,
      tanggal: row.tanggal instanceof Date
        ? Utilities.formatDate(row.tanggal, Session.getScriptTimeZone(), "dd/MM/yyyy")
        : ""
    });
  });
  return { outstanding: outstanding, items: aktif.reverse() };
}

function createSumberDanaFromMutasi_(ss, mutasiPayload, mutasiId) {
  ensureSumberDanaSheets_(ss);
  const untuk = String(mutasiPayload.sdUntukPembelian || "").trim();
  const petugas = String(mutasiPayload.sdPetugas || "").trim();
  if (!untuk) throw new Error("Untuk pembelian wajib diisi saat membuat Sumber Dana.");
  if (!petugas) throw new Error("Petugas wajib diisi saat membuat Sumber Dana.");

  const sdId = generateSdId_(mutasiPayload.tanggal);
  const sh = ss.getSheetByName("SUMBER_DANA");
  sh.appendRow([
    sdId,
    new Date(mutasiPayload.tanggal),
    mutasiId,
    String(mutasiPayload.tujuan || "").trim(),
    Number(mutasiPayload.nominal) || 0,
    untuk,
    petugas,
    SD_STATUS_AKTIF_,
    String(mutasiPayload.keterangan || "")
  ]);
  return sdId;
}

function validateSdAlokasiInput_(ss, alokasi, nominalRequired, rekeningRequired) {
  const required = Number(nominalRequired) || 0;
  if (required <= 0) return { alokasi: [], rekening: "" };

  if (!alokasi || !alokasi.length) {
    throw new Error("Alokasi Sumber Dana wajib diisi jika ada pembayaran.");
  }

  const terpakaiMap = buildSdTerpakaiMap_(ss);
  const sdRows = {};
  readSumberDanaRows_(ss, false).forEach(function(r) {
    sdRows[r.sdId] = r;
  });

  let total = 0;
  let rekening = "";
  const normalized = [];

  alokasi.forEach(function(item, idx) {
    const sdId = String(item.sdId || "").trim();
    const nom = Number(item.nominal) || 0;
    if (!sdId) throw new Error("Baris alokasi " + (idx + 1) + ": SD wajib dipilih.");
    if (nom <= 0) throw new Error("Baris alokasi " + (idx + 1) + ": nominal harus > 0.");

    const row = sdRows[sdId];
    if (!row) throw new Error("Sumber Dana tidak ditemukan: " + sdId);
    if (row.status !== SD_STATUS_AKTIF_) throw new Error("Sumber Dana tidak aktif: " + sdId);

    const sisaLive = Math.max(0, row.nominalAwal - (terpakaiMap[sdId] || 0));
    if (nom > sisaLive + 0.0001) {
      throw new Error("Nominal melebihi sisa SD " + sdId + " (sisa Rp " + formatNumberId_(sisaLive) + ").");
    }

    if (!rekening) rekening = row.rekening;
    if (rekening && row.rekening !== rekening) {
      throw new Error("Semua SD dalam satu pembayaran harus rekening yang sama.");
    }

    total += nom;
    normalized.push({
      sdId: sdId,
      nominal: nom,
      rekening: row.rekening,
      untukPembelian: row.untukPembelian,
      petugas: row.petugas
    });
  });

  if (Math.abs(total - required) > 0.01) {
    throw new Error("Total alokasi SD (Rp " + formatNumberId_(total) + ") harus sama dengan nominal bayar (Rp " + formatNumberId_(required) + ").");
  }

  if (rekeningRequired && !rekening) {
    throw new Error("Rekening dari Sumber Dana tidak ditemukan.");
  }

  return { alokasi: normalized, rekening: rekening };
}

function saveSdAlokasi_(ss, jenis, refNo, tanggal, alokasi) {
  if (!alokasi || !alokasi.length) return;
  ensureSdAlokasiSheet_(ss);
  const sh = ss.getSheetByName("SD_ALOKASI");
  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(new Date(), tz, "yyyyMMdd");
  const baseRow = sh.getLastRow();

  alokasi.forEach(function(item, index) {
    const alokasiId = "AL-" + dateStr + "-" + (baseRow + index);
    sh.appendRow([
      alokasiId,
      item.sdId,
      jenis,
      refNo,
      new Date(tanggal),
      Number(item.nominal) || 0,
      item.untukPembelian || "",
      item.petugas || ""
    ]);
  });

  refreshSdStatus_(ss, alokasi.map(function(a) { return a.sdId; }));
}

function refreshSdStatus_(ss, sdIds) {
  if (!sdIds || !sdIds.length) return;
  const sh = ss.getSheetByName("SUMBER_DANA");
  if (!sh || sh.getLastRow() < 2) return;

  const terpakai = buildSdTerpakaiMap_(ss);
  const unique = {};
  sdIds.forEach(function(id) { unique[id] = true; });

  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const sdId = String(data[i][0] || "").trim();
    if (!unique[sdId]) continue;
    const nominalAwal = Number(data[i][4]) || 0;
    const sisa = Math.max(0, nominalAwal - (terpakai[sdId] || 0));
    const status = sisa <= 0.0001 ? SD_STATUS_HABIS_ : SD_STATUS_AKTIF_;
    sh.getRange(i + 1, 8).setValue(status);
  }
}

function resolveSdAlokasiForSave_(ss, payload, nominalField) {
  const nominal = Number(payload[nominalField]) || 0;
  if (nominal <= 0) return { alokasi: [], rekening: "" };

  if (!payload.sdAlokasi || !payload.sdAlokasi.length) {
    throw new Error("Alokasi Sumber Dana wajib diisi. Pilih petugas dan SD.");
  }

  return validateSdAlokasiInput_(ss, payload.sdAlokasi, nominal, true);
}
