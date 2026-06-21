// Auth, session, manajemen pengguna
function getSessionEmail_() {
  try {
    // Hanya email pengunjung yang login — jangan pakai getEffectiveUser() (bisa = owner deploy).
    const email = Session.getActiveUser().getEmail();
    return String(email || "").trim().toLowerCase();
  } catch (e) {
    return "";
  }
}

function shareDatabasesWithUser_(email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return;

  const ids = [DATABASE_ID];
  try {
    const backendId = getBackendEngineId_();
    if (backendId) ids.push(backendId);
  } catch (e) {
    Logger.log("shareDatabasesWithUser_ backend id: " + (e.message || e));
  }

  ids.forEach(function(id) {
    try {
      DriveApp.getFileById(id).addEditor(target);
    } catch (e) {
      Logger.log("shareDatabasesWithUser_ gagal " + id + " → " + target + ": " + (e.message || e));
    }
  });
}

function ensureUsersSheet_(ss) {
  let sh = ss.getSheetByName("USERS");
  if (!sh) {
    sh = ss.insertSheet("USERS");
    sh.appendRow(["ID", "Email", "Nama", "Role", "Aktif", "Dibuat", "Catatan"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function formatUserDate_(val) {
  if (!val) return "";
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString();
  return String(val);
}

function usersReadAll_(sh) {
  if (sh.getLastRow() < 2) return [];
  const all = sh.getDataRange().getValues();
  if (all.length <= 1) return [];
  return all.slice(1).map(function(row) {
    while (row.length < 7) row.push("");
    return row;
  });
}

function readUsers_(ss, includeInactive) {
  ensureUsersSheet_(ss);
  const sh = ss.getSheetByName("USERS");
  const out = [];
  usersReadAll_(sh).forEach(function(row) {
    if (!includeInactive && !masterIsActive_(row[4])) return;
    const email = String(row[1] || "").trim().toLowerCase();
    if (!email) return;
    out.push({
      id: String(row[0] || "").trim(),
      email: email,
      nama: String(row[2] || "").trim(),
      role: normalizeUserRole_(row[3]),
      aktif: masterIsActive_(row[4]),
      dibuat: formatUserDate_(row[5]),
      catatan: String(row[6] || "").trim()
    });
  });
  return out;
}

function findUserRowByEmail_(sh, email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return 0;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const emails = sh.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < emails.length; i++) {
    if (String(emails[i][0] || "").trim().toLowerCase() === target) return i + 2;
  }
  return 0;
}

function findUserRowById_(sh, id) {
  const target = String(id || "").trim();
  if (!target) return 0;
  const rows = usersReadAll_(sh);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === target) return i + 2;
  }
  return 0;
}

function nextUserId_(sh) {
  const n = Math.max(0, sh.getLastRow() - 1);
  return "USR-" + String(n + 1).padStart(4, "0");
}

function normalizeUserRole_(role) {
  const r = String(role || "").trim().toLowerCase();
  if (USER_ROLES_.indexOf(r) >= 0) return r;
  return "staff";
}

function getRoleMenus_(role) {
  const r = normalizeUserRole_(role);
  if (r === "owner" || !ROLE_MENUS_[r]) return null;
  return ROLE_MENUS_[r];
}

const AUTH_CACHE_TTL_SEC_ = 300;
const AUTH_CACHE_PREFIX_ = "auth_v2_";

function authCacheKey_(email) {
  return AUTH_CACHE_PREFIX_ + String(email || "").trim().toLowerCase();
}

function readAuthUserFromSheet_(sh, email) {
  const rowNum = findUserRowByEmail_(sh, email);
  if (!rowNum) return null;
  const row = sh.getRange(rowNum, 1, 1, 7).getValues()[0];
  if (!masterIsActive_(row[4])) {
    throw new Error("Akun " + email + " dinonaktifkan. Hubungi administrator.");
  }
  return {
    id: String(row[0] || "").trim(),
    email: email,
    nama: String(row[2] || "").trim(),
    role: normalizeUserRole_(row[3])
  };
}

function cacheAuthUser_(user) {
  if (!user || !user.email) return;
  try {
    CacheService.getUserCache().put(authCacheKey_(user.email), JSON.stringify(user), AUTH_CACHE_TTL_SEC_);
  } catch (ignore) {}
}

function clearAuthCache_(email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return;
  try {
    CacheService.getUserCache().remove(authCacheKey_(target));
  } catch (ignore) {}
}

function authGuard_() {
  if (CURRENT_AUTH_USER_) return CURRENT_AUTH_USER_.email;

  const email = getSessionEmail_();
  if (!email) {
    throw new Error(
      "Gagal memverifikasi akun Google. Pastikan scope userinfo.email aktif, lalu deploy ulang dan izinkan ulang aplikasi."
    );
  }

  try {
    const cached = CacheService.getUserCache().get(authCacheKey_(email));
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.email === email && parsed.role) {
        CURRENT_AUTH_USER_ = parsed;
        return email;
      }
    }
  } catch (ignore) {}

  const ss = getDatabaseSpreadsheet_();
  const sh = ensureUsersSheet_(ss);
  if (sh.getLastRow() < 2) {
    throw new Error("Aplikasi belum disetup. Daftarkan owner pertama di halaman setup.");
  }

  const user = readAuthUserFromSheet_(sh, email);
  if (!user) {
    throw new Error("Akun " + email + " belum terdaftar. Hubungi owner untuk pendaftaran di menu Setting → Pengguna.");
  }

  CURRENT_AUTH_USER_ = user;
  cacheAuthUser_(user);
  return email;
}

function getCurrentAuthRole_() {
  return CURRENT_AUTH_USER_ ? CURRENT_AUTH_USER_.role : null;
}

function assertRole_(roles) {
  authGuard_();
  const role = getCurrentAuthRole_();
  if (!role || roles.indexOf(role) < 0) {
    throw new Error("Anda tidak memiliki izin untuk aksi ini (role: " + (role || "-") + ").");
  }
}

function masterEntityCanEdit_(entity, role) {
  const roles = MASTER_ENTITY_ROLES_[entity];
  if (!roles) return false;
  return roles.indexOf(role || "") >= 0;
}

function assertMasterEntityRole_(entity) {
  authGuard_();
  const role = getCurrentAuthRole_();
  if (!masterEntityCanEdit_(entity, role)) {
    const label = MASTER_ENTITY_LABELS_[entity] || entity;
    throw new Error("Anda tidak memiliki izin mengubah " + label + " (role: " + (role || "-") + ").");
  }
}

function getMasterPermissions() {
  authGuard_();
  const role = getCurrentAuthRole_();
  const edit = {};
  Object.keys(MASTER_ENTITY_ROLES_).forEach(function(key) {
    edit[key] = masterEntityCanEdit_(key, role);
  });
  return { role: role, edit: edit };
}

function getSessionUser() {
  const appDisplayName = getAppDisplayName_();
  const email = getSessionEmail_();
  if (!email) {
    return { ok: false, reason: "no_email", appDisplayName: appDisplayName, message: "Tidak dapat membaca email Google. Login ulang ke akun Google." };
  }

  const ss = getDatabaseSpreadsheet_();
  const sh = ensureUsersSheet_(ss);
  if (sh.getLastRow() < 2) {
    return { ok: true, needsSetup: true, email: email, menus: null, appDisplayName: appDisplayName };
  }

  const rowNum = findUserRowByEmail_(sh, email);
  if (!rowNum) {
    return {
      ok: false,
      reason: "not_registered",
      email: email,
      appDisplayName: appDisplayName,
      message: "Email belum terdaftar. Minta owner menambahkan Anda di Setting → Pengguna."
    };
  }

  const row = sh.getRange(rowNum, 1, 1, 7).getValues()[0];
  if (!masterIsActive_(row[4])) {
    return { ok: false, reason: "inactive", email: email, appDisplayName: appDisplayName, message: "Akun Anda dinonaktifkan." };
  }

  const me = {
    id: String(row[0] || "").trim(),
    email: email,
    nama: String(row[2] || "").trim(),
    role: normalizeUserRole_(row[3])
  };

  return {
    ok: true,
    needsSetup: false,
    appDisplayName: appDisplayName,
    user: {
      id: me.id,
      email: me.email,
      nama: me.nama,
      role: me.role,
      roleLabel: userRoleLabel_(me.role)
    },
    menus: getRoleMenus_(me.role)
  };
}

function userRoleLabel_(role) {
  if (role === "owner") return "Owner";
  if (role === "akuntan") return "Akuntan";
  return "Staff";
}

function registerInitialOwner(payload) {
  const email = getSessionEmail_();
  if (!email) throw new Error("Login Google diperlukan untuk setup owner.");

  const ss = getDatabaseSpreadsheet_();
  ensureUsersSheet_(ss);
  if (readUsers_(ss, true).length > 0) {
    throw new Error("Setup owner sudah dilakukan. Hubungi owner untuk pendaftaran user baru.");
  }

  const reqEmail = String(payload.email || "").trim().toLowerCase();
  if (reqEmail !== email) {
    throw new Error("Email harus sama dengan akun Google yang sedang login (" + email + ").");
  }

  const nama = String(payload.nama || "").trim() || email.split("@")[0];
  const sh = ss.getSheetByName("USERS");
  sh.appendRow([nextUserId_(sh), email, nama, "owner", "YA", new Date(), "Owner awal"]);
  shareDatabasesWithUser_(email);
  clearAuthCache_(email);
  return { success: true, email: email, role: "owner" };
}

function listUsers() {
  assertRole_(["owner"]);
  const ss = getDatabaseSpreadsheet_();
  return readUsers_(ss, true).map(function(u) {
    return {
      id: u.id,
      email: u.email,
      nama: u.nama,
      role: u.role,
      aktif: u.aktif,
      dibuat: u.dibuat,
      catatan: u.catatan,
      roleLabel: userRoleLabel_(u.role)
    };
  });
}

function saveUser(payload) {
  assertRole_(["owner"]);
  const email = String(payload.email || "").trim().toLowerCase();
  const nama = String(payload.nama || "").trim();
  const role = normalizeUserRole_(payload.role);
  if (!email) throw new Error("Email wajib diisi.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email tidak valid.");

  const ss = getDatabaseSpreadsheet_();
  const sh = ensureUsersSheet_(ss);
  const id = String(payload.id || "").trim();
  const aktif = payload.aktif === false ? "TIDAK" : "YA";
  const catatan = String(payload.catatan || "").trim();
  let cacheEmailsToClear = [email];

  let rowNum = id ? findUserRowById_(sh, id) : 0;
  if (!rowNum) {
    const dup = findUserRowByEmail_(sh, email);
    if (dup) {
      const dupVals = sh.getRange(dup, 1, 1, 7).getValues()[0];
      const dupRole = normalizeUserRole_(dupVals[3]);
      const dupNama = String(dupVals[2] || "").trim() || email;
      if (dupRole === "owner") {
        throw new Error(
          "Email ini sudah terdaftar sebagai Owner (" + dupNama + "). Tidak perlu ditambahkan lagi."
        );
      }
      if (!masterIsActive_(dupVals[4])) {
        const dupId = String(dupVals[0] || "").trim() || nextUserId_(sh);
        sh.getRange(dup, 1, 1, 7).setValues([[
          dupId,
          email,
          nama || dupNama,
          role,
          aktif,
          dupVals[5] || new Date(),
          catatan || String(dupVals[6] || "").trim()
        ]]);
        if (masterIsActive_(aktif)) shareDatabasesWithUser_(email);
        clearAuthCache_(email);
        return { success: true, id: dupId, reactivated: true };
      }
      throw new Error(
        "Email sudah terdaftar (" + dupNama + ", " + userRoleLabel_(dupRole) + "). Gunakan Edit untuk mengubah."
      );
    }
    const row = [nextUserId_(sh), email, nama || email.split("@")[0], role, aktif, new Date(), catatan];
    sh.appendRow(row);
    if (masterIsActive_(aktif)) shareDatabasesWithUser_(email);
    clearAuthCache_(email);
    return { success: true, id: row[0] };
  }

  const existingEmail = String(sh.getRange(rowNum, 2).getValue() || "").trim().toLowerCase();
  if (email !== existingEmail) {
    const dup = findUserRowByEmail_(sh, email);
    if (dup && dup !== rowNum) throw new Error("Email sudah dipakai user lain.");
    cacheEmailsToClear.push(existingEmail);
  }

  const existingRole = normalizeUserRole_(sh.getRange(rowNum, 4).getValue());
  if (existingRole === "owner" && role !== "owner") {
    const owners = readUsers_(ss, false).filter(function(u) { return u.role === "owner"; });
    if (owners.length <= 1) throw new Error("Tidak dapat mengubah role owner terakhir.");
  }

  sh.getRange(rowNum, 1, 1, 7).setValues([[
    id,
    email,
    nama || email.split("@")[0],
    role,
    aktif,
    sh.getRange(rowNum, 6).getValue() || new Date(),
    catatan
  ]]);
  if (masterIsActive_(aktif)) shareDatabasesWithUser_(email);
  cacheEmailsToClear.forEach(clearAuthCache_);
  return { success: true, id: id };
}

function setUserStatus(id, aktif) {
  assertRole_(["owner"]);
  const ss = getDatabaseSpreadsheet_();
  const sh = ensureUsersSheet_(ss);
  const rowNum = findUserRowById_(sh, id);
  if (!rowNum) throw new Error("User tidak ditemukan.");

  const userEmail = String(sh.getRange(rowNum, 2).getValue() || "").trim().toLowerCase();

  if (!aktif) {
    const role = normalizeUserRole_(sh.getRange(rowNum, 4).getValue());
    if (role === "owner") {
      const owners = readUsers_(ss, false).filter(function(u) { return u.role === "owner"; });
      if (owners.length <= 1) throw new Error("Tidak dapat menonaktifkan owner terakhir.");
    }
  }

  sh.getRange(rowNum, 5).setValue(aktif ? "YA" : "TIDAK");
  clearAuthCache_(userEmail);
  return { success: true };
}

function requireAuth() {
  return authGuard_();
}
