import { buildPrintCompanyHeader, type PrintCompanyHeader } from "@/lib/org/print-company-header";
import {
  escapeHtml,
  formatDateId,
  formatRp,
  printDocumentBaseCss
} from "@/lib/org/print-utils";
import type { AssetRegisterReport, AssetRegisterStatusFilter } from "./daftar-aset";

function statusFilterLabel(filter: AssetRegisterStatusFilter | string): string {
  if (filter === "active") return "Aktif saja";
  if (filter === "disposed") return "Sudah dispose";
  return "Semua status";
}

export function buildDaftarAsetPrintHtml(
  report: AssetRegisterReport,
  company: PrintCompanyHeader
): string {
  const { period } = report;
  const rows = report.rows
    .map(
      (row) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">
          <div style="font-weight:600;">${escapeHtml(row.name)}</div>
          ${row.code ? `<div style="font-size:11px;color:#64748b;">${escapeHtml(row.code)}</div>` : ""}
        </td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.category)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.acquisitionDate)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatRp(row.acquisitionCost)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatRp(row.totalDepreciated)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatRp(row.bookValue)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;">${escapeHtml(row.statusLabel)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#64748b;">${escapeHtml(row.assetCoaAccount)}</td>
      </tr>`
    )
    .join("");

  const selisih = report.reconciliation.selisih;
  const selisihWarn = Math.abs(selisih) > 0.01;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Daftar Aset Tetap</title>
  <style>
    ${printDocumentBaseCss()}
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .summary-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .summary-label { font-size: 11px; color: #64748b; margin: 0 0 4px; }
    .summary-value { font-size: 15px; font-weight: 700; margin: 0; }
    table.data { width: 100%; border-collapse: collapse; font-size: 12px; }
    table.data th {
      text-align: left;
      padding: 8px;
      background: #f1f5f9;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #475569;
    }
    table.data th.num { text-align: right; }
    table.data tfoot td {
      padding: 8px;
      border-top: 2px solid #cbd5e1;
      background: #f8fafc;
      font-weight: 700;
    }
    .recon {
      margin-top: 18px;
      padding: 14px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      font-size: 12px;
    }
    .recon-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .recon-total { border-top: 1px solid #cbd5e1; margin-top: 6px; padding-top: 8px; font-weight: 700; }
    .warn { color: #b45309; font-size: 11px; margin-top: 8px; }
    .footnote { margin-top: 14px; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div class="doc">
    <div class="doc-header">
      <div class="doc-header-left">
        ${buildPrintCompanyHeader(company)}
      </div>
      <div class="doc-header-right">
        <h2 class="doc-title">DAFTAR ASET</h2>
        <p class="doc-meta-line">Snapshot per <strong>${escapeHtml(formatDateId(period.end))}</strong></p>
        <p class="doc-meta-line">Filter: <strong>${escapeHtml(statusFilterLabel(report.statusFilter))}</strong></p>
        <p class="doc-meta-line">Dicetak: ${escapeHtml(new Date().toLocaleString("id-ID"))}</p>
      </div>
    </div>
    <div class="doc-body">
      <div class="summary-grid">
        <div class="summary-box">
          <p class="summary-label">Jumlah aset</p>
          <p class="summary-value">${report.totals.count} unit</p>
        </div>
        <div class="summary-box">
          <p class="summary-label">Total nilai perolehan</p>
          <p class="summary-value">${formatRp(report.totals.acquisitionCost)}</p>
        </div>
        <div class="summary-box">
          <p class="summary-label">Total nilai buku</p>
          <p class="summary-value">${formatRp(report.totals.bookValue)}</p>
        </div>
      </div>

      <table class="data">
        <thead>
          <tr>
            <th>Nama / Kode</th>
            <th>Kategori</th>
            <th>Perolehan</th>
            <th class="num">Nilai</th>
            <th class="num">Akumulasi</th>
            <th class="num">Nilai buku</th>
            <th>Status</th>
            <th>Akun</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" style="padding:16px;text-align:center;color:#64748b;">Tidak ada data</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Jumlah (${report.totals.count})</td>
            <td style="text-align:right;">${formatRp(report.totals.acquisitionCost)}</td>
            <td style="text-align:right;">${formatRp(report.totals.totalDepreciated)}</td>
            <td style="text-align:right;">${formatRp(report.totals.bookValue)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>

      <div class="recon">
        <div style="font-weight:700;margin-bottom:8px;">Rekonsiliasi dengan Neraca (Aset Tetap)</div>
        <div class="recon-row">
          <span>Nilai buku register (aset aktif)</span>
          <span>${formatRp(report.reconciliation.registerActiveBookValue)}</span>
        </div>
        <div class="recon-row">
          <span>Saldo neraca — Aset Tetap</span>
          <span>${formatRp(report.reconciliation.neracaAsetTetap)}</span>
        </div>
        <div class="recon-row recon-total">
          <span>Selisih</span>
          <span style="color:${selisihWarn ? "#b45309" : "#047857"};">${formatRp(selisih)}</span>
        </div>
        ${
          selisihWarn
            ? `<p class="warn">Periksa jurnal manual, penyusutan, atau klasifikasi COA jika selisih signifikan.</p>`
            : ""
        }
      </div>

      <p class="footnote">
        Periode laporan ${escapeHtml(period.start)} s/d ${escapeHtml(period.end)}.
        Penyusutan dihitung dari log sampai tanggal akhir. Hanya aset dengan tanggal perolehan ≤ tanggal akhir yang ditampilkan.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function openDaftarAsetPrintWindow(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");

  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Popup diblokir. Izinkan popup untuk cetak laporan.");
  }

  const triggerPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      // window closed
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (w.document?.readyState === "complete") {
    setTimeout(triggerPrint, 300);
  } else {
    w.addEventListener("load", () => setTimeout(triggerPrint, 300), { once: true });
  }
}
