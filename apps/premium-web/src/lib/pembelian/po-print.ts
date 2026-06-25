import { buildPrintCompanyHeader } from "@/lib/org/print-company-header";

export type PoPrintCompany = {
  name: string;
  address?: string;
  phone?: string;
  logoUrl?: string | null;
};

export type PoPrintDetail = {
  order: {
    poNo: string;
    orderDate: string;
    supplierName: string;
    status: string;
    grandTotal: number;
    bayar: number;
    sisaTagihan: number;
  };
  lines: Array<{
    description: string;
    qty: number;
    unitCost: number;
    diskon: number;
    lineTotal: number;
  }>;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusLabel(status: string): string {
  if (status === "VOIDED") return "Dibatalkan";
  if (status === "POSTED") return "Jurnal OK";
  if (status === "CONFIRMED") return "Belum jurnal";
  return status;
}

export function buildPoPrintHtml(detail: PoPrintDetail, company: PoPrintCompany): string {
  const { order, lines } = detail;
  const lineRows = lines
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(l.description)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${l.qty}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatRp(l.unitCost)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatRp(l.diskon)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatRp(l.lineTotal)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>PO ${escapeHtml(order.poNo)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .muted { color: #6b7280; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #1f6f54; color: white; padding: 10px 8px; text-align: left; font-size: 13px; }
    .footer-total { font-size: 16px; font-weight: 700; color: #2563eb; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  ${buildPrintCompanyHeader(company)}
  <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
  <p><strong>Purchase Order:</strong> ${escapeHtml(order.poNo)} &nbsp; <strong>Tanggal:</strong> ${escapeHtml(order.orderDate)}</p>
  <p><strong>Supplier:</strong> ${escapeHtml(order.supplierName || "—")} &nbsp; <strong>Status:</strong> ${escapeHtml(statusLabel(order.status))}</p>
  <table>
    <thead>
      <tr>
        <th>Barang / Jasa</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Harga</th>
        <th style="text-align:right;">Diskon</th>
        <th style="text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="padding:12px 8px;text-align:right;font-weight:700;">Grand Total</td>
        <td class="footer-total" style="padding:12px 8px;text-align:right;">${formatRp(order.grandTotal)}</td>
      </tr>
      <tr>
        <td colspan="4" style="padding:4px 8px;text-align:right;">Sudah dibayar</td>
        <td style="padding:4px 8px;text-align:right;">${formatRp(order.bayar)}</td>
      </tr>
      <tr>
        <td colspan="4" style="padding:4px 8px;text-align:right;">Sisa hutang</td>
        <td style="padding:4px 8px;text-align:right;">${formatRp(order.sisaTagihan)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

export function openPoPrintWindow(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");

  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Popup diblokir. Izinkan popup untuk cetak PO.");
  }

  const triggerPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      // print() can throw if window was closed
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (w.document?.readyState === "complete") {
    setTimeout(triggerPrint, 250);
  } else {
    w.addEventListener("load", () => setTimeout(triggerPrint, 250), { once: true });
  }
}
