"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { OutletOption } from "@/lib/outlets/bootstrap-options";
import {
  INVITABLE_ROLES,
  type InvitableRole,
  type OrgMemberRow
} from "@/lib/org/members";
import { MEMBERSHIP_ROLES, ROLE_LABELS, type MembershipRole } from "@/lib/org/roles";

function roleBadge(role: MembershipRole) {
  if (role === "owner") return "bg-violet-100 text-violet-800";
  if (role === "akuntan") return "bg-blue-100 text-blue-800";
  if (role === "staff") return "bg-emerald-100 text-emerald-800";
  if (role === "cashier") return "bg-amber-100 text-amber-800";
  if (role === "outlet_staff") return "bg-orange-100 text-orange-800";
  return "bg-slate-100 text-slate-700";
}

export default function TimPageClient() {
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [outletOptions, setOutletOptions] = useState<OutletOption[]>([]);
  const [outletAddonEnabled, setOutletAddonEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitableRole>("staff");
  const [inviteOutletCode, setInviteOutletCode] = useState("");

  const invitableRoles = useMemo(() => {
    if (!outletAddonEnabled) {
      return INVITABLE_ROLES.filter((r) => r !== "cashier" && r !== "outlet_staff");
    }
    return [...INVITABLE_ROLES];
  }, [outletAddonEnabled]);

  const needsOutletOnInvite = inviteRole === "cashier" || inviteRole === "outlet_staff";

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org/members");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setMembers(data.members || []);
      setOutletAddonEnabled(data.outletAddon?.enabled === true);
      setOutletOptions(data.outletAddon?.options || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!needsOutletOnInvite) return;
    if (!inviteOutletCode && outletOptions.length) {
      setInviteOutletCode(outletOptions[0].outletCode);
    }
  }, [needsOutletOnInvite, inviteOutletCode, outletOptions]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    setTempPassword(null);
    try {
      const body: Record<string, unknown> = {
        email,
        role: inviteRole,
        fullName: fullName || undefined
      };
      if (inviteRole === "cashier" || inviteRole === "outlet_staff") {
        if (!inviteOutletCode) throw new Error("Pilih outlet");
        body.outletCodes = [inviteOutletCode];
      }

      const res = await fetch("/api/org/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menambah");
      setMessage(data.message || "Anggota ditambahkan");
      if (data.tempPassword) setTempPassword(data.tempPassword);
      setEmail("");
      setFullName("");
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menambah");
    } finally {
      setSaving(false);
    }
  }

  async function onRoleChange(
    membershipId: string,
    role: MembershipRole,
    outletCodes?: string[]
  ) {
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { role };
      if (role === "cashier" || role === "outlet_staff") {
        const member = members.find((m) => m.membershipId === membershipId);
        const codes =
          outletCodes ||
          member?.outletScopes.map((s) => s.outletCode).filter(Boolean) ||
          (outletOptions[0] ? [outletOptions[0].outletCode] : []);
        if (!codes.length) {
          throw new Error("Wajib ditetapkan ke outlet");
        }
        body.outletCodes = codes;
      }

      const res = await fetch(`/api/org/members/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengubah peran");
      setMessage("Peran diperbarui");
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah peran");
    }
  }

  async function onCashierOutletChange(membershipId: string, outletCode: string) {
    const member = members.find((m) => m.membershipId === membershipId);
    if (!member) return;
    await onRoleChange(membershipId, member.role, outletCode ? [outletCode] : []);
  }

  async function onRemove(membershipId: string, memberEmail: string) {
    if (!confirm(`Hapus ${memberEmail} dari organisasi?`)) return;
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/org/members/${membershipId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus");
      setMessage("Anggota dihapus");
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Tim & Akses"
        description="Kelola anggota organisasi, peran, dan penugasan kasir per outlet."
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
      {tempPassword && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Password sementara (salin sekarang — tidak ditampilkan lagi):</p>
          <code className="mt-2 block rounded bg-white px-3 py-2 font-mono text-base">{tempPassword}</code>
          <p className="mt-2 text-xs text-amber-800">
            Bagikan ke anggota tim. Mereka bisa login lalu ganti password di menu <strong>Akun</strong>.
          </p>
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-bold text-slate-900">Tambah anggota</h2>
        <p className="mt-1 text-xs text-slate-500">
          Jika email belum punya akun, sistem membuat akun baru dengan password sementara.
        </p>
        <form onSubmit={onInvite} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@perusahaan.com"
            />
          </div>
          <div>
            <Label>Nama (opsional)</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nama lengkap"
            />
          </div>
          <div>
            <Label>Peran</Label>
            <Select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InvitableRole)}
            >
              {invitableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          {needsOutletOnInvite ? (
            <div>
              <Label>Outlet *</Label>
              {outletOptions.length ? (
                <Select
                  value={inviteOutletCode}
                  onChange={(e) => setInviteOutletCode(e.target.value)}
                  required
                >
                  {outletOptions.map((o) => (
                    <option key={o.outletCode} value={o.outletCode}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="mt-1 text-xs text-amber-700">
                  Belum ada outlet aktif — buat dulu di Master → Outlet / Cabang (add-on Multi Outlet).
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? "Menyimpan…" : "Tambah anggota"}
              </Button>
            </div>
          )}
          {needsOutletOnInvite ? (
            <div className="flex items-end sm:col-span-2">
              <Button
                type="submit"
                disabled={saving || !outletOptions.length}
                className="w-full sm:w-auto"
              >
                {saving
                  ? "Menyimpan…"
                  : inviteRole === "cashier"
                    ? "Tambah kasir outlet"
                    : "Tambah staf stok outlet"}
              </Button>
            </div>
          ) : null}
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Daftar anggota</h2>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Memuat…</p>
        ) : members.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">Belum ada anggota.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Nama</th>
                  <th className="px-5 py-3 font-semibold">Peran</th>
                  {outletAddonEnabled ? (
                    <th className="px-5 py-3 font-semibold">Outlet</th>
                  ) : null}
                  <th className="px-5 py-3 font-semibold">Bergabung</th>
                  <th className="px-5 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.membershipId} className="text-slate-700">
                    <td className="px-5 py-3 font-medium text-slate-900">{m.email}</td>
                    <td className="px-5 py-3">{m.fullName || "—"}</td>
                    <td className="px-5 py-3">
                      {m.role === "owner" ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadge(m.role)}`}
                        >
                          {ROLE_LABELS[m.role]}
                        </span>
                      ) : (
                        <Select
                          value={m.role}
                          onChange={(e) =>
                            void onRoleChange(m.membershipId, e.target.value as MembershipRole)
                          }
                          className="max-w-[140px] py-1.5 text-xs"
                        >
                          {MEMBERSHIP_ROLES.filter((r) => r !== "owner").map((r) => {
                            if ((r === "cashier" || r === "outlet_staff") && !outletAddonEnabled) {
                              return null;
                            }
                            return (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            );
                          })}
                        </Select>
                      )}
                    </td>
                    {outletAddonEnabled ? (
                      <td className="px-5 py-3">
                        {m.role === "cashier" || m.role === "outlet_staff" ? (
                          outletOptions.length ? (
                            <Select
                              value={m.outletScopes[0]?.outletCode || ""}
                              onChange={(e) =>
                                void onCashierOutletChange(m.membershipId, e.target.value)
                              }
                              className="max-w-[180px] py-1.5 text-xs"
                            >
                              {outletOptions.map((o) => (
                                <option key={o.outletCode} value={o.outletCode}>
                                  {o.outletCode}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span className="text-xs text-amber-700">Belum ada outlet</span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(m.createdAt).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {m.role !== "owner" && (
                        <button
                          type="button"
                          onClick={() => void onRemove(m.membershipId, m.email)}
                          className="text-xs font-semibold text-red-600 hover:text-red-700"
                        >
                          Hapus
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">Ringkasan peran</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <strong>Staff</strong> — penjualan, expense, piutang/hutang, kas
          </li>
          <li>
            <strong>Akuntan</strong> — jurnal, posting, laporan, COA
          </li>
          <li>
            <strong>Kasir</strong> — hanya POS, terkunci ke outlet yang ditetapkan
          </li>
          <li>
            <strong>Stok Outlet</strong> — opname/penyesuaian stok gudang outlet (perlu add-on Multi
            Outlet)
          </li>
          <li>
            <strong>Owner</strong> — akses penuh operasional + pengaturan usaha
          </li>
        </ul>
      </Card>
    </div>
  );
}
