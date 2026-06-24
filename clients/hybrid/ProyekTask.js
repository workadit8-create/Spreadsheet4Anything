// Add-on Proyek — Task checklist event catering (v2)
// ==========================================

const PROYEK_TASK_STATUS_ = ["PENDING", "DONE", "NA"];

const PROYEK_TASK_TEMPLATES_ = {
  wedding: {
    label: "Wedding / Perayaan Besar",
    items: [
      { fase: "Pre-deal", judul: "Data proyek lengkap (customer, tanggal, pax, lokasi)", offsetDays: -21, wajib: true },
      { fase: "Pre-deal", judul: "Quotation terkirim ke customer", offsetDays: -21, wajib: true },
      { fase: "Pre-deal", judul: "Follow-up & negosiasi menu", offsetDays: -14, wajib: true },
      { fase: "Pre-deal", judul: "DP masuk — update status CONFIRMED", offsetDays: -14, wajib: true },
      { fase: "Pre-deal", judul: "Lock menu & pax final", offsetDays: -14, wajib: true },
      { fase: "Persiapan", judul: "Purchase Request bahan (PR)", offsetDays: -7, wajib: true },
      { fase: "Persiapan", judul: "PO bahan — tag ke proyek", offsetDays: -5, wajib: true },
      { fase: "Persiapan", judul: "Cek stok / belanja sisa", offsetDays: -3, wajib: true },
      { fase: "Persiapan", judul: "Briefing crew + transport + peralatan", offsetDays: -1, wajib: true },
      { fase: "Persiapan", judul: "Konfirmasi ulang ke customer", offsetDays: -1, wajib: true },
      { fase: "H-day", judul: "Setup di lokasi", offsetDays: 0, wajib: true },
      { fase: "H-day", judul: "Serving / operasional", offsetDays: 0, wajib: true },
      { fase: "H-day", judul: "Breakdown & bersih-bersih", offsetDays: 0, wajib: true },
      { fase: "Post-event", judul: "Invoice final — tag proyek", offsetDays: 1, wajib: true },
      { fase: "Post-event", judul: "Review L/R proyek", offsetDays: 2, wajib: true },
      { fase: "Post-event", judul: "Tandai proyek SELESAI", offsetDays: 2, wajib: true },
      { fase: "Post-event", judul: "Feedback customer", offsetDays: 3, wajib: false }
    ]
  },
  corporate: {
    label: "Corporate / Gathering",
    items: [
      { fase: "Pre-deal", judul: "Data proyek & quotation", offsetDays: -10, wajib: true },
      { fase: "Pre-deal", judul: "Deal / konfirmasi order", offsetDays: -7, wajib: true },
      { fase: "Persiapan", judul: "Purchase Request bahan", offsetDays: -5, wajib: true },
      { fase: "Persiapan", judul: "PO bahan — tag proyek", offsetDays: -3, wajib: true },
      { fase: "Persiapan", judul: "Briefing internal crew", offsetDays: -1, wajib: true },
      { fase: "H-day", judul: "Setup — serve — breakdown", offsetDays: 0, wajib: true },
      { fase: "Post-event", judul: "Invoice final — tag proyek", offsetDays: 1, wajib: true },
      { fase: "Post-event", judul: "Review L/R + tandai SELESAI", offsetDays: 2, wajib: true }
    ]
  },
  kecil: {
    label: "Event Kecil / Aqiqah / Family",
    items: [
      { fase: "Pre-deal", judul: "Proyek + quotation", offsetDays: -7, wajib: true },
      { fase: "Pre-deal", judul: "Deal / konfirmasi", offsetDays: -5, wajib: true },
      { fase: "Persiapan", judul: "Purchase Request bahan", offsetDays: -5, wajib: true },
      { fase: "Persiapan", judul: "PO bahan — tag proyek", offsetDays: -3, wajib: true },
      { fase: "H-day", judul: "Operasional event", offsetDays: 0, wajib: true },
      { fase: "Post-event", judul: "Invoice — tag proyek", offsetDays: 1, wajib: true },
      { fase: "Post-event", judul: "Review L/R + SELESAI", offsetDays: 2, wajib: true }
    ]
  }
};

function ensureProyekTaskSheet_(ss) {
  let sh = ss.getSheetByName("PROYEK_TASK");
  if (!sh) {
    sh = ss.insertSheet("PROYEK_TASK");
    sh.appendRow([
      "ID", "Kode Proyek", "Template", "Fase", "Judul", "Offset Hari",
      "Deadline", "PIC", "Status", "Catatan", "Urutan", "Selesai Pada"
    ]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function formatProyekTaskOffsetLabel_(offsetDays) {
  const n = Number(offsetDays);
  if (isNaN(n)) return "";
  if (n === 0) return "H-day";
  if (n > 0) return "H+" + n;
  return "H" + n;
}

function normalizeProyekTaskStatus_(val) {
  const s = String(val || "").trim().toUpperCase();
  if (PROYEK_TASK_STATUS_.indexOf(s) >= 0) return s;
  return "PENDING";
}

function computeProyekTaskDeadline_(tanggalEvent, offsetDays) {
  if (!tanggalEvent) return "";
  const base = tanggalEvent instanceof Date ? new Date(tanggalEvent.getTime()) : new Date(String(tanggalEvent).slice(0, 10) + "T12:00:00");
  if (isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Number(offsetDays || 0));
  return Utilities.formatDate(base, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function nextProyekTaskId_(sh) {
  if (!sh || sh.getLastRow() < 2) return "TASK-000001";
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  let max = 0;
  ids.forEach(function(r) {
    const m = String(r[0] || "").trim().match(/^TASK-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return "TASK-" + String(max + 1).padStart(6, "0");
}

function readProyekTasks_(ss, kodeProyek) {
  ensureProyekTaskSheet_(ss);
  const sh = ss.getSheetByName("PROYEK_TASK");
  const target = normalizeKodeProyek_(kodeProyek);
  if (!target || sh.getLastRow() < 2) return [];

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
  const out = [];
  data.forEach(function(row) {
    if (normalizeKodeProyek_(row[1]) !== target) return;
    const offsetDays = Number(row[5]);
    out.push({
      id: String(row[0] || "").trim(),
      kodeProyek: String(row[1] || "").trim(),
      template: String(row[2] || "").trim(),
      fase: String(row[3] || "").trim(),
      judul: String(row[4] || "").trim(),
      offsetDays: isNaN(offsetDays) ? 0 : offsetDays,
      offsetLabel: formatProyekTaskOffsetLabel_(offsetDays),
      deadline: formatProyekDate_(row[6]),
      pic: String(row[7] || "").trim(),
      status: normalizeProyekTaskStatus_(row[8]),
      catatan: String(row[9] || "").trim(),
      urutan: Number(row[10]) || 0,
      selesaiPada: formatProyekDate_(row[11])
    });
  });
  out.sort(function(a, b) {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    return a.offsetDays - b.offsetDays;
  });
  return out;
}

function findProyekTaskRow_(sh, taskId) {
  const target = String(taskId || "").trim();
  if (!target || sh.getLastRow() < 2) return 0;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === target) return i + 2;
  }
  return 0;
}

function proyekTaskProgress_(tasks) {
  const list = tasks || [];
  let done = 0;
  let pending = 0;
  let overdue = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  list.forEach(function(t) {
    if (t.status === "DONE" || t.status === "NA") {
      done += 1;
      return;
    }
    pending += 1;
    if (t.deadline) {
      const d = new Date(t.deadline + "T12:00:00");
      if (!isNaN(d.getTime()) && d.getTime() < today.getTime()) overdue += 1;
    }
  });

  return {
    total: list.length,
    done: done,
    pending: pending,
    overdue: overdue,
    pct: list.length ? Math.round((done / list.length) * 100) : 0
  };
}

function getProyekEventDate_(ss, kodeProyek) {
  const list = readMasterProyek_(ss, { activeOnly: false });
  const target = normalizeKodeProyek_(kodeProyek);
  for (let i = 0; i < list.length; i++) {
    if (list[i].kode === target) return list[i].tanggalEvent;
  }
  return "";
}

function recalcProyekTaskDeadlines_(ss, kodeProyek) {
  const sh = ensureProyekTaskSheet_(ss);
  const tanggalEvent = getProyekEventDate_(ss, kodeProyek);
  if (!tanggalEvent) return;
  const tasks = readProyekTasks_(ss, kodeProyek);
  tasks.forEach(function(t) {
    const rowNum = findProyekTaskRow_(sh, t.id);
    if (!rowNum) return;
    const deadline = computeProyekTaskDeadline_(tanggalEvent, t.offsetDays);
    sh.getRange(rowNum, 7).setValue(deadline ? new Date(deadline + "T12:00:00") : "");
  });
}

function getProyekTaskTemplates() {
  authGuard_();
  assertAddonProject_();
  return Object.keys(PROYEK_TASK_TEMPLATES_).map(function(key) {
    return {
      key: key,
      label: PROYEK_TASK_TEMPLATES_[key].label,
      itemCount: PROYEK_TASK_TEMPLATES_[key].items.length
    };
  });
}

function listProyekTasks(kodeProyek) {
  authGuard_();
  assertAddonProject_();
  const ss = getDatabaseSpreadsheet_();
  const kode = normalizeKodeProyek_(kodeProyek);
  if (!kode) throw new Error("Kode proyek wajib diisi.");

  let proyekMeta = null;
  readMasterProyek_(ss, { activeOnly: false }).forEach(function(p) {
    if (p.kode === kode) proyekMeta = p;
  });
  if (!proyekMeta) throw new Error("Proyek tidak ditemukan: " + kode);

  const tasks = readProyekTasks_(ss, kode);
  return {
    kode: kode,
    proyek: proyekMeta,
    tasks: tasks,
    progress: proyekTaskProgress_(tasks)
  };
}

function initProyekTasksFromTemplate(kodeProyek, templateKey) {
  authGuard_();
  assertAddonProject_();
  assertProyekEditRole_();

  const key = String(templateKey || "").trim().toLowerCase();
  const tpl = PROYEK_TASK_TEMPLATES_[key];
  if (!tpl) throw new Error("Template checklist tidak dikenal: " + templateKey);

  const kode = normalizeKodeProyek_(kodeProyek);
  if (!kode) throw new Error("Kode proyek wajib diisi.");

  const lock = acquireSaveLock_("proyek task init");
  try {
    const ss = getDatabaseSpreadsheet_();
    const existing = readProyekTasks_(ss, kode);
    if (existing.length) {
      throw new Error("Proyek sudah punya checklist. Hapus manual di sheet jika perlu reset.");
    }

    const tanggalEvent = getProyekEventDate_(ss, kode);
    if (!tanggalEvent) throw new Error("Tanggal event proyek belum diisi — isi dulu di master proyek.");

    const sh = ensureProyekTaskSheet_(ss);
    const firstId = nextProyekTaskId_(sh);
    let baseNum = 1;
    const idMatch = firstId.match(/^TASK-(\d+)$/i);
    if (idMatch) baseNum = Number(idMatch[1]);

    const rows = tpl.items.map(function(item, idx) {
      const id = "TASK-" + String(baseNum + idx).padStart(6, "0");
      const deadlineStr = computeProyekTaskDeadline_(tanggalEvent, item.offsetDays);
      return [
        id,
        kode,
        key,
        item.fase,
        item.judul,
        item.offsetDays,
        deadlineStr ? new Date(deadlineStr + "T12:00:00") : "",
        "",
        "PENDING",
        "",
        idx + 1,
        ""
      ];
    });

    if (rows.length) writeSheetRows_(sh, rows);
    return { success: true, kode: kode, template: key, count: rows.length };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function updateProyekTask(payload) {
  authGuard_();
  assertAddonProject_();
  assertProyekEditRole_();

  const taskId = String(payload.id || "").trim();
  if (!taskId) throw new Error("ID task wajib diisi.");

  const lock = acquireSaveLock_("proyek task");
  try {
    const ss = getDatabaseSpreadsheet_();
    const sh = ensureProyekTaskSheet_(ss);
    const rowNum = findProyekTaskRow_(sh, taskId);
    if (!rowNum) throw new Error("Task tidak ditemukan: " + taskId);

    const row = sh.getRange(rowNum, 1, 1, 12).getValues()[0];
    const nextStatus = payload.status !== undefined
      ? normalizeProyekTaskStatus_(payload.status)
      : normalizeProyekTaskStatus_(row[8]);
    const nextPic = payload.pic !== undefined ? String(payload.pic || "").trim() : String(row[7] || "").trim();
    const nextCatatan = payload.catatan !== undefined ? String(payload.catatan || "").trim() : String(row[9] || "").trim();

    sh.getRange(rowNum, 8).setValue(nextPic);
    sh.getRange(rowNum, 9).setValue(nextStatus);
    sh.getRange(rowNum, 10).setValue(nextCatatan);

    if (nextStatus === "DONE" && normalizeProyekTaskStatus_(row[8]) !== "DONE") {
      sh.getRange(rowNum, 12).setValue(new Date());
    } else if (nextStatus !== "DONE") {
      sh.getRange(rowNum, 12).setValue("");
    }

    return { success: true, id: taskId, status: nextStatus };
  } catch (err) {
    throw new Error(err.message);
  } finally {
    lock.releaseLock();
  }
}

function getProyekTaskDashboardAlerts_(ss) {
  if (!isAddonProjectEnabled_()) return [];

  ensureProyekTaskSheet_(ss);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonLimit = new Date(today.getTime());
  soonLimit.setDate(soonLimit.getDate() + 3);

  const proyekMap = {};
  readMasterProyek_(ss, { activeOnly: true }).forEach(function(p) {
    if (p.status === "SELESAI" || p.status === "BATAL") return;
    proyekMap[p.kode] = p;
  });

  const overdue = [];
  const dueSoon = [];

  const sh = ss.getSheetByName("PROYEK_TASK");
  if (!sh || sh.getLastRow() < 2) return [];

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
  data.forEach(function(row) {
    const kode = normalizeKodeProyek_(row[1]);
    const proyek = proyekMap[kode];
    if (!proyek) return;
    const status = normalizeProyekTaskStatus_(row[8]);
    if (status !== "PENDING") return;

    const deadline = formatProyekDate_(row[6]);
    if (!deadline) return;
    const d = new Date(deadline + "T12:00:00");
    if (isNaN(d.getTime())) return;

    const item = {
      kode: kode,
      nama: proyek.nama,
      judul: String(row[4] || "").trim(),
      deadline: deadline
    };

    if (d.getTime() < today.getTime()) overdue.push(item);
    else if (d.getTime() <= soonLimit.getTime()) dueSoon.push(item);
  });

  overdue.sort(function(a, b) { return a.deadline.localeCompare(b.deadline); });
  dueSoon.sort(function(a, b) { return a.deadline.localeCompare(b.deadline); });

  const alerts = [];
  overdue.slice(0, 5).forEach(function(t) {
    alerts.push({
      level: "error",
      text: "Task terlambat (" + t.deadline + "): " + t.judul + " — " + t.nama + " [" + t.kode + "]"
    });
  });
  dueSoon.slice(0, 3).forEach(function(t) {
    alerts.push({
      level: "warn",
      text: "Task deadline dekat (" + t.deadline + "): " + t.judul + " — " + t.nama
    });
  });

  return alerts;
}
