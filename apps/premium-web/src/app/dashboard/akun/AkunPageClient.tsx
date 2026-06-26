"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { MembershipRole } from "@/lib/org/roles";
import type { TelegramSettingsView } from "@/lib/telegram/settings";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
          autoComplete={label.includes("saat ini") ? "current-password" : "new-password"}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
          aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, "0")}:00 WIB`
}));

export default function AkunPageClient({
  email,
  role
}: {
  email: string;
  role: MembershipRole;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [tgLoading, setTgLoading] = useState(true);
  const [tgSaving, setTgSaving] = useState(false);
  const [tgSettings, setTgSettings] = useState<TelegramSettingsView | null>(null);
  const [tgLink, setTgLink] = useState<string | null>(null);

  const loadTelegram = useCallback(async () => {
    setTgLoading(true);
    try {
      const res = await fetch("/api/telegram/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat Telegram");
      setTgSettings(data.settings);
    } catch {
      setTgSettings(null);
    } finally {
      setTgLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTelegram();
  }, [loadTelegram]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengubah password");
      setMessage(data.message || "Password berhasil diubah");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah password");
    } finally {
      setSaving(false);
    }
  }

  async function connectTelegram() {
    setTgSaving(true);
    setError(null);
    setMessage(null);
    setTgLink(null);
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat link");
      setTgLink(data.deepLink);
      setMessage(data.message || "Buka link Telegram");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghubungkan");
    } finally {
      setTgSaving(false);
    }
  }

  async function disconnectTelegram() {
    setTgSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memutus");
      setTgLink(null);
      await loadTelegram();
      setMessage("Telegram diputus");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memutus");
    } finally {
      setTgSaving(false);
    }
  }

  async function saveTelegramPrefs(patch: {
    dailyDigestEnabled?: boolean;
    projectRemindersEnabled?: boolean;
    digestHourWib?: number;
    projectReminderHourWib?: number;
  }) {
    setTgSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preferences", ...patch })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      await loadTelegram();
      setMessage("Preferensi Telegram disimpan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setTgSaving(false);
    }
  }

  async function testDigest() {
    setTgSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-digest" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal kirim uji coba");
      setMessage(data.message || "Digest uji coba dikirim");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal kirim uji coba");
    } finally {
      setTgSaving(false);
    }
  }

  const tg = tgSettings;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <PageHeader
        title="Akun"
        description="Password login dan notifikasi Telegram."
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800">Telegram</h2>
        <p className="mt-1 text-xs text-slate-500">
          Owner: ringkasan harian jam 20:00 WIB + perintah <span className="font-mono">/ringkasan</span>{" "}
          di bot. Tim: reminder tugas proyek (add-on aktif).
        </p>

        {tgLoading ? (
          <p className="mt-4 text-sm text-slate-500">Memuat…</p>
        ) : !tg?.botConfigured ? (
          <p className="mt-4 text-sm text-amber-700">
            Bot Telegram belum dikonfigurasi di server (hubungi admin platform).
          </p>
        ) : tg.connected ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">
              Terhubung
              {tg.telegramUsername ? (
                <>
                  {" "}
                  sebagai <span className="font-medium">@{tg.telegramUsername}</span>
                </>
              ) : null}
            </p>

            {tg.canDailyDigest ? (
              <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tg.dailyDigestEnabled}
                    disabled={tgSaving}
                    onChange={(e) => void saveTelegramPrefs({ dailyDigestEnabled: e.target.checked })}
                  />
                  Ringkasan harian otomatis (owner)
                </label>
                <div>
                  <Label className="text-xs">Jam kirim digest</Label>
                  <Select
                    value={String(tg.digestHourWib)}
                    disabled={tgSaving || !tg.dailyDigestEnabled}
                    onChange={(e) =>
                      void saveTelegramPrefs({ digestHourWib: Number(e.target.value) })
                    }
                  >
                    {HOUR_OPTIONS.map((h) => (
                      <option key={h.value} value={h.value}>
                        {h.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={tgSaving}
                  onClick={() => void testDigest()}
                >
                  Kirim digest uji coba
                </Button>
              </div>
            ) : null}

            {tg.canProjectReminders ? (
              <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tg.projectRemindersEnabled}
                    disabled={tgSaving}
                    onChange={(e) =>
                      void saveTelegramPrefs({ projectRemindersEnabled: e.target.checked })
                    }
                  />
                  Reminder proyek (tugas jatuh tempo)
                </label>
                <div>
                  <Label className="text-xs">Jam reminder proyek</Label>
                  <Select
                    value={String(tg.projectReminderHourWib)}
                    disabled={tgSaving || !tg.projectRemindersEnabled}
                    onChange={(e) =>
                      void saveTelegramPrefs({ projectReminderHourWib: Number(e.target.value) })
                    }
                  >
                    {HOUR_OPTIONS.map((h) => (
                      <option key={h.value} value={h.value}>
                        {h.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              variant="secondary"
              disabled={tgSaving}
              onClick={() => void disconnectTelegram()}
            >
              Putuskan Telegram
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <Button type="button" disabled={tgSaving} onClick={() => void connectTelegram()}>
              {tgSaving ? "Membuat link…" : "Hubungkan Telegram"}
            </Button>
            {tgLink ? (
              <p className="text-sm">
                <a
                  href={tgLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 underline"
                >
                  Buka Telegram → tekan Start
                </a>
                <span className="block text-xs text-slate-500 mt-1">Link berlaku 15 menit.</span>
              </p>
            ) : null}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <p className="text-xs text-slate-500">
          Login sebagai <span className="font-medium text-slate-700">{email}</span>
          {role ? (
            <>
              {" "}
              · peran <span className="font-medium text-slate-700">{role}</span>
            </>
          ) : null}
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <PasswordField
            label="Password saat ini"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
          />
          <PasswordField
            label="Password baru"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
          />
          <PasswordField
            label="Konfirmasi password baru"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((v) => !v)}
          />

          <p className="text-xs text-slate-500">Minimal 8 karakter.</p>

          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            {saving ? "Menyimpan…" : "Simpan password baru"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
