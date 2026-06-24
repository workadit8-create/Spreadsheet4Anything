import type { HistoryDetail } from "./history";

export type InvoicePrintCompany = {
  name: string;
  address?: string;
  phone?: string;
};

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

export function buildInvoicePrintHtml(
  detail: HistoryDetail,
  company: InvoicePrintCompany
): string {
  const { order, lines } = detail;
  const lineRows = lines
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(l.productName)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${l.qty}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatRp(l.unitPrice)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatRp(l.diskon)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatRp(l.lineTotal)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(order.orderNo)}</title>
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
  <h1>${escapeHtml(company.name)}</h1>
  ${company.address ? `<p class="muted">${escapeHtml(company.address)}</p>` : ""}
  ${company.phone ? `<p class="muted">${escapeHtml(company.phone)}</p>` : ""}
  <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
  <p><strong>Invoice:</strong> ${escapeHtml(order.orderNo)} &nbsp; <strong>Tanggal:</strong> ${escapeHtml(order.orderDate)}</p>
  <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
  <table>
    <thead>
      <tr>
        <th>Produk</th>
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
        <td colspan="4" style="padding:4px 8px;text-align:right;">Sisa tagihan</td>
        <td style="padding:4px 8px;text-align:right;">${formatRp(order.sisaTagihan)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openInvoicePrintWindow(html: string) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) {
    throw new Error("Popup diblokir. Izinkan popup untuk cetak invoice.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => {
    w.print();
  };
}
