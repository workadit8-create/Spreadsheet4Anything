export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatRp(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

export function formatDateId(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

/** CSS dasar untuk dokumen cetak (invoice, PO, dll.) */
export function printDocumentBaseCss(primary = "#0d5c4d", accent = "#b8860b"): string {
  return `
    @page { size: A4; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: #1f2937;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc {
      max-width: 210mm;
      margin: 0 auto;
      background: #fff;
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      background: linear-gradient(135deg, ${primary} 0%, #0a3d34 100%);
      color: #fff;
      padding: 22px 26px;
      border-radius: 10px 10px 0 0;
    }
    .doc-header-left { display: flex; gap: 16px; align-items: flex-start; flex: 1; min-width: 0; }
    .doc-logo {
      display: block;
      max-height: 64px;
      max-width: 120px;
      object-fit: contain;
      background: rgba(255,255,255,0.95);
      border-radius: 8px;
      padding: 6px;
    }
    .doc-company-name {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .doc-company-meta {
      margin: 0;
      font-size: 11px;
      opacity: 0.92;
      line-height: 1.5;
    }
    .doc-header-right { text-align: right; flex-shrink: 0; }
    .doc-title {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: #fff;
    }
    .doc-meta-line {
      margin: 6px 0 0;
      font-size: 11px;
      opacity: 0.95;
    }
    .doc-meta-line strong { font-weight: 600; }
    .doc-body { padding: 20px 26px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px; }
    .doc-cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 22px;
    }
    .doc-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .doc-card-label {
      margin: 0 0 6px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
    }
    .doc-card-value {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .doc-card-sub {
      margin: 4px 0 0;
      font-size: 11px;
      color: #475569;
    }
    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .status-paid { background: #dcfce7; color: #166534; }
    .status-unpaid { background: #fef3c7; color: #b45309; }
    .status-void { background: #fee2e2; color: #b91c1c; }
    table.doc-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
    }
    table.doc-table thead th {
      background: ${primary};
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 10px 10px;
      text-align: left;
    }
    table.doc-table thead th.num { text-align: right; }
    table.doc-table thead th.center { text-align: center; }
    table.doc-table tbody td {
      padding: 10px 10px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
      font-size: 12px;
    }
    table.doc-table tbody tr:nth-child(even) td { background: #f8fafc; }
    table.doc-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    table.doc-table tbody td.center { text-align: center; }
    table.doc-table tbody td.product-name { font-weight: 600; color: #111827; }
    table.doc-table tbody td.product-sku { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .doc-footer-row {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .doc-footer-left { flex: 1; min-width: 200px; max-width: 380px; }
    .doc-summary {
      width: 280px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
    }
    .doc-summary-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 5px 0;
      font-size: 12px;
      color: #64748b;
    }
    .doc-summary-row span:last-child {
      color: #1f2937;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .doc-summary-total {
      margin-top: 8px;
      padding-top: 10px;
      border-top: 2px solid ${primary};
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .doc-summary-total .label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: ${primary};
    }
    .doc-summary-total .value {
      font-size: 18px;
      font-weight: 800;
      color: ${accent};
      font-variant-numeric: tabular-nums;
    }
    .doc-summary-due .value { color: #dc2626; font-weight: 700; }
    .doc-bank {
      margin-top: 20px;
      padding: 12px 14px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      max-width: 360px;
    }
    .doc-bank-title {
      margin: 0 0 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${primary};
    }
    .doc-bank-body {
      margin: 0;
      font-size: 11px;
      color: #374151;
      line-height: 1.55;
      white-space: pre-line;
    }
    .doc-thanks {
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 11px;
      color: #6b7280;
    }
    .doc-thanks strong { display: block; font-size: 12px; color: #374151; margin-bottom: 4px; }
    .stamp-paid {
      position: relative;
      margin-top: -120px;
      margin-right: 20px;
      text-align: right;
      pointer-events: none;
    }
    .stamp-paid span {
      display: inline-block;
      border: 3px solid #16a34a;
      color: #16a34a;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.15em;
      padding: 8px 18px;
      border-radius: 6px;
      transform: rotate(-12deg);
      opacity: 0.85;
    }
    .stamp-void span {
      border-color: #dc2626;
      color: #dc2626;
    }
    @media print {
      body { margin: 0; }
      .doc { max-width: none; border: none; }
      .doc-header, .doc-body { border-radius: 0; }
    }
  `;
}
