"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import type { AuditLogRow } from "@/lib/audit/log";
import { AUDIT_ACTION_LABELS, formatAuditMetadataSummary } from "@/lib/audit/labels";
import { ROLE_LABELS, type MembershipRole } from "@/lib/org/roles";

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}

function roleLabel(role: string | null) {
  if (!role) return "—";
  if ((ROLE_LABELS as Record<string, string>)[role]) {
    return ROLE_LABELS[role as MembershipRole];
  }
  return role;
}

export default function AuditLogPageClient() {
  const [entries, setEntries] = useState<AuditLogRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async (before?: string | null, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (before) params.set("before", before);
      const res = await fetch(`/api/org/audit-log?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat log");
      const rows = (data.entries || []) as AuditLogRow[];
      setEntries((prev) => (append ? [...prev, ...rows] : rows));
      setNextBefore(data.nextBefore ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat log");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Log Audit"
        description="Jejak aksi sensitif: posting jurnal, void, perubahan tim, dan profil usaha."
      />

      {error ? (
        <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
      ) : null}

      <Card className="overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Memuat log audit…</p>
        ) : entries.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Belum ada entri audit.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  <th className="px-4 py-3 font-semibold">Aksi</th>
                  <th className="px-4 py-3 font-semibold">Detail</th>
                  <th className="px-4 py-3 font-semibold">Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {AUDIT_ACTION_LABELS[row.action] || row.action}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatAuditMetadataSummary(row.action, row.metadata)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{row.actorEmail || "—"}</div>
                      <div className="text-xs text-slate-400">{roleLabel(row.actorRole)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {nextBefore ? (
          <div className="border-t border-slate-100 p-4">
            <Button
              type="button"
              variant="secondary"
              disabled={loadingMore}
              onClick={() => void loadEntries(nextBefore, true)}
            >
              {loadingMore ? "Memuat…" : "Muat lebih banyak"}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
