// ==========================================
// QA SMOKE TEST — modul Pengguna (owner only)
// Jalankan: runQaSmokeTestUsers() dari web app atau Script Editor
// ==========================================

const QA_TEST_CATATAN_ = "QA_AUTO_TEST";

function qaRecord_(results, name, passed, detail, recommendation) {
  results.push({
    name: name,
    passed: !!passed,
    detail: detail || "",
    recommendation: recommendation || ""
  });
}

function qaTry_(results, name, fn, recommendationOnFail) {
  try {
    const detail = fn();
    qaRecord_(results, name, true, typeof detail === "string" ? detail : "OK");
    return true;
  } catch (e) {
    qaRecord_(results, name, false, e.message || String(e), recommendationOnFail || "");
    return false;
  }
}

function qaTestEmail_() {
  return "qa.auto." + Date.now() + "@qa-test.invalid";
}

function qaDeleteUserRowByEmail_(ss, email) {
  const sh = ss.getSheetByName("USERS");
  if (!sh) return false;
  const rowNum = findUserRowByEmail_(sh, email);
  if (!rowNum) return false;
  sh.deleteRow(rowNum);
  return true;
}

function qaInspectUsersSheet_(ss) {
  const findings = [];
  const sh = ss.getSheetByName("USERS");
  if (!sh) {
    findings.push({
      severity: "error",
      issue: "Sheet USERS tidak ditemukan",
      recommendation: "Buka aplikasi sebagai owner sekali agar ensureUsersSheet_ membuat sheet."
    });
    return findings;
  }

  const headers = sh.getRange(1, 1, 1, 7).getValues()[0].map(function(h) {
    return String(h || "").trim();
  });
  const expected = ["ID", "Email", "Nama", "Role", "Aktif", "Dibuat", "Catatan"];
  expected.forEach(function(h, i) {
    if (headers[i] !== h) {
      findings.push({
        severity: "error",
        issue: "Header kolom " + (i + 1) + " salah: \"" + (headers[i] || "(kosong)") + "\"",
        recommendation: "Perbaiki baris header USERS menjadi: " + expected.join(", ")
      });
    }
  });

  const rows = usersReadAll_(sh);
  const emailMap = {};
  rows.forEach(function(row, idx) {
    const sheetRow = idx + 2;
    const email = String(row[1] || "").trim().toLowerCase();
    const id = String(row[0] || "").trim();
    const role = normalizeUserRole_(row[3]);

    if (!email && (id || row[2] || row[3])) {
      findings.push({
        severity: "warn",
        issue: "Baris " + sheetRow + " punya data tapi email kosong",
        recommendation: "Isi kolom Email atau hapus baris hantu di sheet USERS."
      });
    }
    if (email) {
      if (emailMap[email]) {
        findings.push({
          severity: "error",
          issue: "Email duplikat: " + email + " (baris " + emailMap[email] + " dan " + sheetRow + ")",
          recommendation: "Hapus atau gabung baris duplikat; simpan satu record aktif saja."
        });
      } else {
        emailMap[email] = sheetRow;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        findings.push({
          severity: "warn",
          issue: "Format email tidak valid di baris " + sheetRow + ": " + email,
          recommendation: "Perbaiki email ke format Google yang valid."
        });
      }
    }
    if (email && String(row[3] || "").trim() && role === "staff" && String(row[3]).trim().toLowerCase() !== "staff") {
      findings.push({
        severity: "info",
        issue: "Role tidak dikenal di baris " + sheetRow + " → dinormalisasi ke staff",
        recommendation: "Gunakan owner, staff, atau akuntan."
      });
    }
    if (row[5] instanceof Date === false && row[5] && String(row[5]).trim()) {
      // OK — string date
    } else if (row[5] instanceof Date) {
      // OK — akan diserialisasi di listUsers
    }
  });

  const owners = rows.filter(function(r) {
    return normalizeUserRole_(r[3]) === "owner" && masterIsActive_(r[4]);
  });
  if (!owners.length) {
    findings.push({
      severity: "error",
      issue: "Tidak ada owner aktif di sheet USERS",
      recommendation: "Daftarkan owner lewat setup awal atau perbaiki baris owner (Role=owner, Aktif=YA)."
    });
  }

  return findings;
}

function qaRunUsersModule_() {
  const results = [];
  const ss = getDatabaseSpreadsheet_();
  ensureUsersSheet_(ss);
  const testEmail = qaTestEmail_();
  let testUserId = "";

  qaTry_(results, "Sheet USERS ada", function() {
    const sh = ss.getSheetByName("USERS");
    if (!sh) throw new Error("Sheet USERS tidak ditemukan");
    return "Baris data: " + Math.max(0, sh.getLastRow() - 1);
  }, "Jalankan aplikasi sebagai owner untuk membuat sheet USERS.");

  qaTry_(results, "Minimal 1 owner terdaftar", function() {
    const users = readUsers_(ss, true);
    const owners = users.filter(function(u) { return u.role === "owner"; });
    if (!owners.length) throw new Error("Tidak ada owner");
    return owners.length + " owner: " + owners.map(function(o) { return o.email; }).join(", ");
  }, "Lengkapi setup owner di halaman pertama aplikasi.");

  qaTry_(results, "Session login = owner", function() {
    const session = getSessionUser();
    if (!session.ok) throw new Error(session.message || session.reason);
    if (session.needsSetup) throw new Error("Aplikasi belum disetup owner");
    if (session.user.role !== "owner") {
      throw new Error("Login sebagai " + session.user.role + ", bukan owner");
    }
    return session.user.email + " (" + session.user.roleLabel + ")";
  }, "Jalankan QA dengan akun Google owner yang terdaftar.");

  qaTry_(results, "listUsers() dapat dipanggil owner", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = listUsers();
    if (!Array.isArray(rows)) throw new Error("Return bukan array");
    return rows.length + " user";
  }, "Pastikan role owner aktif dan scope userinfo.email disetujui.");

  qaTry_(results, "listUsers() JSON-serializable (no Date mentah)", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = listUsers();
    const json = JSON.stringify(rows);
    const parsed = JSON.parse(json);
    if (!parsed.length) throw new Error("Array kosong — owner tidak terbaca");
    parsed.forEach(function(u) {
      if (typeof u.dibuat === "object" && u.dibuat !== null) {
        throw new Error("Kolom dibuat masih objek, bukan string");
      }
    });
    return "Serialize " + parsed.length + " user OK";
  }, "Perbaiki formatUserDate_ di readUsers_ agar dibuat jadi string ISO.");

  qaTry_(results, "Validasi email kosong ditolak", function() {
    CURRENT_AUTH_USER_ = null;
    try {
      saveUser({ email: "", nama: "QA", role: "staff" });
      throw new Error("Seharusnya throw error");
    } catch (e) {
      if (String(e.message).indexOf("wajib") < 0) throw e;
      return e.message;
    }
  }, "Cek validasi di saveUser untuk email wajib.");

  qaTry_(results, "Validasi format email ditolak", function() {
    CURRENT_AUTH_USER_ = null;
    try {
      saveUser({ email: "bukan-email", nama: "QA", role: "staff" });
      throw new Error("Seharusnya throw error");
    } catch (e) {
      if (String(e.message).indexOf("valid") < 0) throw e;
      return e.message;
    }
  }, "Cek regex validasi email di saveUser.");

  qaTry_(results, "Tambah user staff test", function() {
    CURRENT_AUTH_USER_ = null;
    const res = saveUser({
      email: testEmail,
      nama: "QA Auto Test",
      role: "staff",
      catatan: QA_TEST_CATATAN_
    });
    if (!res || !res.success || !res.id) throw new Error("saveUser gagal");
    testUserId = res.id;
    return "ID " + testUserId + " · " + testEmail;
  }, "Cek permission spreadsheet dan fungsi appendRow USERS.");

  qaTry_(results, "User test muncul di listUsers", function() {
    CURRENT_AUTH_USER_ = null;
    const rows = listUsers();
    const hit = rows.filter(function(u) { return u.id === testUserId; })[0];
    if (!hit) throw new Error("User test tidak ditemukan di list");
    if (hit.role !== "staff") throw new Error("Role salah: " + hit.role);
    return hit.nama + " · " + hit.roleLabel;
  }, "Cek usersReadAll_ / readUsers_ membaca baris baru.");

  qaTry_(results, "Duplikat email staff ditolak", function() {
    CURRENT_AUTH_USER_ = null;
    try {
      saveUser({ email: testEmail, nama: "Duplikat", role: "staff" });
      throw new Error("Seharusnya throw error");
    } catch (e) {
      if (String(e.message).indexOf("terdaftar") < 0) throw e;
      return e.message;
    }
  }, "Cek findUserRowByEmail_ dan pesan duplikat.");

  qaTry_(results, "Duplikat email owner ditolak dengan pesan jelas", function() {
    CURRENT_AUTH_USER_ = null;
    const owners = readUsers_(ss, true).filter(function(u) { return u.role === "owner"; });
    if (!owners.length) throw new Error("Tidak ada owner untuk uji");
    const ownerEmail = owners[0].email;
    try {
      saveUser({ email: ownerEmail, nama: "Fake", role: "staff" });
      throw new Error("Seharusnya throw error");
    } catch (e) {
      const msg = String(e.message);
      if (msg.indexOf("Owner") < 0 && msg.indexOf("owner") < 0) {
        throw new Error("Pesan kurang jelas: " + msg);
      }
      return msg;
    }
  }, "Perbaiki pesan duplikat owner di saveUser.");

  qaTry_(results, "Edit user test", function() {
    CURRENT_AUTH_USER_ = null;
    saveUser({
      id: testUserId,
      email: testEmail,
      nama: "QA Auto Updated",
      role: "akuntan",
      catatan: QA_TEST_CATATAN_
    });
    const hit = listUsers().filter(function(u) { return u.id === testUserId; })[0];
    if (!hit || hit.nama !== "QA Auto Updated" || hit.role !== "akuntan") {
      throw new Error("Data tidak terupdate");
    }
    return hit.nama + " · " + hit.roleLabel;
  }, "Cek setValues update di saveUser.");

  qaTry_(results, "Nonaktifkan user test", function() {
    CURRENT_AUTH_USER_ = null;
    setUserStatus(testUserId, false);
    const hit = listUsers().filter(function(u) { return u.id === testUserId; })[0];
    if (!hit || hit.aktif) throw new Error("User masih aktif");
    return "Nonaktif OK";
  }, "Cek setUserStatus dan kolom Aktif.");

  qaTry_(results, "Reaktivasi user nonaktif via saveUser", function() {
    CURRENT_AUTH_USER_ = null;
    const res = saveUser({
      email: testEmail,
      nama: "QA Auto Reactivated",
      role: "staff",
      catatan: QA_TEST_CATATAN_
    });
    if (!res.reactivated && !res.success) throw new Error("Reaktivasi gagal");
    const hit = listUsers().filter(function(u) { return u.id === testUserId; })[0];
    if (!hit || !hit.aktif) throw new Error("User belum aktif kembali");
    return res.reactivated ? "Reactivated" : "Updated";
  }, "Cek logika reaktivasi user nonaktif di saveUser.");

  qaTry_(results, "Cleanup user test", function() {
    const deleted = qaDeleteUserRowByEmail_(ss, testEmail);
    if (!deleted) throw new Error("Baris test tidak ditemukan untuk dihapus");
    const hit = readUsers_(ss, true).filter(function(u) { return u.email === testEmail; })[0];
    if (hit) throw new Error("User test masih ada setelah cleanup");
    return "Dihapus dari USERS";
  }, "Hapus manual baris dengan catatan QA_AUTO_TEST di sheet USERS.");

  return qaBuildReport_("pengguna", results, qaInspectUsersSheet_(ss));
}

function qaBuildReport_(moduleName, results, findings) {
  const passed = results.filter(function(r) { return r.passed; }).length;
  const failed = results.filter(function(r) { return !r.passed; }).length;
  const recommendations = [];
  results.forEach(function(r) {
    if (!r.passed && r.recommendation) recommendations.push(r.name + ": " + r.recommendation);
  });
  (findings || []).forEach(function(f) {
    if (f.severity === "error" || f.severity === "warn") {
      recommendations.push("[" + f.severity.toUpperCase() + "] " + f.issue + " → " + f.recommendation);
    }
  });
  return {
    module: moduleName,
    ranAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: passed,
      failed: failed,
      ok: failed === 0 && !(findings || []).some(function(f) { return f.severity === "error"; })
    },
    tests: results,
    findings: findings || [],
    recommendations: recommendations
  };
}

function qaAssertJson_(results, name, fn, recommendationOnFail) {
  return qaTry_(results, name, function() {
    const data = fn();
    const json = JSON.stringify(data);
    JSON.parse(json);
    return typeof data === "undefined" ? "OK" : "Serialize OK (" + json.length + " byte)";
  }, recommendationOnFail);
}

function qaTodayYm_() {
  const d = new Date();
  return { bulan: d.getMonth() + 1, tahun: d.getFullYear() };
}

/** Dipanggil dari web app (owner) atau Script Editor */
function runQaSmokeTestUsers() {
  assertRole_(["owner"]);
  return qaRunUsersModule_();
}

/** Bersihkan sisa data QA lama di sheet USERS */
function qaCleanupLeftoverTestUsers() {
  assertRole_(["owner"]);
  const ss = getDatabaseSpreadsheet_();
  const sh = ensureUsersSheet_(ss);
  const rows = usersReadAll_(sh);
  let removed = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const email = String(rows[i][1] || "").trim().toLowerCase();
    const catatan = String(rows[i][6] || "").trim();
    if (email.indexOf("qa.auto.") === 0 || catatan === QA_TEST_CATATAN_) {
      sh.deleteRow(i + 2);
      removed++;
    }
  }
  return { success: true, removed: removed };
}
