"use client";

import Link from "next/link";
import { useState } from "react";

type SyncEvent = {
  id: string;
  direction: string;
  source: string;
  status: string;
  error: string | null;
  created_at: string;
  payload: { orderNo?: string; transactionId?: string };
};

type Props = {
  stats: {
    postedJobs: number;
    failedJobs: number;
    pendingJobs: number;
    sheetSynced: number;
    sheetPending: number;
    totalOrders: number;
  };
  syncEvents: SyncEvent[];
  gasWebappUrl?: string;
  databaseSheetId?: string;
};

export default function LaporanPageClient({ stats, syncEvents, gasWebappUrl, databaseSheetId }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retrySheetSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/posting/sync-sheet", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const ok = (data.results || []).filter((r: { ok: boolean }) => r.ok).length;
      setMessage(`Sync sheet: ${ok} berhasil dari ${data.synced} order`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal sync");
    } finally {
      setSyncing(false);
    }
  }

  const sheetUrl = databaseSheetId
    ? `https://docs.google.com/spreadsheets/d/${databaseSheetId}/edit`
    : null;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
        <div>
          <p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 700 }}>STEP 4 · SYNC BALIK</p>
          <h1 style={{ margin: "6px 0 4px" }}>Laporan bridge</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Status posting jurnal + sync ke sheet PEMASUKAN
          </p>
        </div>
        <Link href="/dashboard" style={{ color: "#64748b", fontSize: 14 }}>← Dashboard</Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Invoice total", value: stats.totalOrders },
          { label: "Jurnal POSTED", value: stats.postedJobs, color: "#059669" },
          { label: "Jurnal FAILED", value: stats.failedJobs, color: "#dc2626" },
          { label: "Queue PENDING", value: stats.pendingJobs },
          { label: "Sheet synced", value: stats.sheetSynced, color: "#059669" },
          { label: "Sheet pending", value: stats.sheetPending, color: "#d97706" }
        ].map((s) => (
          <div key={s.label} style={{ background: "#fff", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color || "#0f172a" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <section style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Aksi</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            type="button"
            onClick={retrySheetSync}
            disabled={syncing}
            style={{
              padding: "8px 14px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: syncing ? "wait" : "pointer",
              fontSize: 14
            }}
          >
            {syncing ? "Syncing..." : "Retry sync sheet PEMASUKAN"}
          </button>
          <Link href="/dashboard/invoices" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, color: "#334155", textDecoration: "none" }}>
            Invoice lab
          </Link>
          {sheetUrl && (
            <a href={sheetUrl} target="_blank" rel="noreferrer" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, color: "#334155", textDecoration: "none" }}>
              Buka client DB sheet
            </a>
          )}
          {gasWebappUrl && (
            <a href={gasWebappUrl} target="_blank" rel="noreferrer" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, color: "#334155", textDecoration: "none" }}>
              Buka GAS web app
            </a>
          )}
        </div>
        {message && <p style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>{message}</p>}
      </section>

      <section style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Sync events (terbaru)</h2>
        {!syncEvents.length ? (
          <p style={{ color: "#64748b", fontSize: 14 }}>Belum ada sync event.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>Waktu</th>
                <th style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>Invoice</th>
                <th style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>Status</th>
                <th style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {syncEvents.map((e) => (
                <tr key={e.id}>
                  <td style={{ padding: "6px", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                    {new Date(e.created_at).toLocaleString("id-ID")}
                  </td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #f1f5f9" }}>
                    <code>{e.payload?.orderNo || "—"}</code>
                  </td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, color: e.status === "DONE" ? "#059669" : e.status === "FAILED" ? "#dc2626" : "#64748b" }}>
                    {e.status}
                  </td>
                  <td style={{ padding: "6px", borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#dc2626" }}>
                    {e.error || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
