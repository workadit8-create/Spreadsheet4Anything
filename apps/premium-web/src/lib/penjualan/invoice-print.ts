import type { HistoryDetail } from "./history";
import {
  escapeHtml,
  formatDateId,
  formatRp,
  printDocumentBaseCss
} from "@/lib/org/print-utils";

export type InvoicePrintCompany = {
  name: string;
  address?: string;
  phone?: string;
  logoUrl?: string | null;
};

export type InvoicePrintCustomer = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
};

function paymentStatus(order: HistoryDetail["order"]): {
  label: string;
  className: string;
  showPaidStamp: boolean;
} {
  if (order.status === "VOIDED") {
    return { label: "Dibatalkan", className: "status-void", showPaidStamp: false };
  }
  if (order.sisaTagihan <= 0 && order.grandTotal > 0) {
    return { label: "Lunas", className: "status-paid", showPaidStamp: true };
  }
  if (order.bayar > 0 && order.sisaTagihan > 0) {
    return { label: "Sebagian", className: "status-unpaid", showPaidStamp: false };
  }
  return { label: "Belum lunas", className: "status-unpaid", showPaidStamp: false };
}

function orderStatusNote(status: string): string {
  if (status === "POSTED") return "Jurnal tercatat";
  if (status === "CONFIRMED") return "Belum posting jurnal";
  if (status === "VOIDED") return "Invoice dibatalkan";
  return status;
}

export function buildInvoicePrintHtml(
  detail: HistoryDetail,
  company: InvoicePrintCompany,
  customer?: InvoicePrintCustomer | null
): string {
  const { order, lines } = detail;
  const status = paymentStatus(order);
  const customerName = customer?.name || order.customerName || "—";

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const totalDiskon = lines.reduce((sum, l) => sum + l.diskon, 0);

  const lineRows = lines
    .map((l, i) => {
      const skuLine = l.sku ? `<div class="product-sku">${escapeHtml(l.sku)}</div>` : "";
      return `<tr>
        <td class="center" style="color:#9ca3af;font-size:11px;">${i + 1}</td>
        <td class="product-name">${escapeHtml(l.productName)}${skuLine}</td>
        <td class="center">${escapeHtml(l.unitCode || "—")}</td>
        <td class="center">${l.qty}</td>
        <td class="num">${formatRp(l.unitPrice)}</td>
        <td class="num">${l.diskon > 0 ? formatRp(l.diskon) : "—"}</td>
        <td class="num" style="font-weight:700;">${formatRp(l.lineTotal)}</td>
      </tr>`;
    })
    .join("");

  const logo = company.logoUrl
    ? `<img class="doc-logo" src="${escapeHtml(company.logoUrl)}" alt="" />`
    : "";

  const companyMeta = [
    company.address ? escapeHtml(company.address) : "",
    company.phone ? `Telp: ${escapeHtml(company.phone)}` : ""
  ]
    .filter(Boolean)
    .join("<br />");

  const customerMeta = [
    customer?.phone ? `Telp: ${escapeHtml(customer.phone)}` : "",
    customer?.email ? escapeHtml(customer.email) : "",
    customer?.address ? escapeHtml(customer.address) : ""
  ]
    .filter(Boolean)
    .join("<br />");

  const stamp =
    status.showPaidStamp && order.status !== "VOIDED"
      ? `<div class="stamp-paid"><span>LUNAS</span></div>`
      : order.status === "VOIDED"
        ? `<div class="stamp-paid stamp-void"><span>VOID</span></div>`
        : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(order.orderNo)}</title>
  <style>${printDocumentBaseCss()}</style>
</head>
<body>
  <div class="doc">
    <header class="doc-header">
      <div class="doc-header-left">
        ${logo}
        <div>
          <h1 class="doc-company-name">${escapeHtml(company.name || "Perusahaan")}</h1>
          ${companyMeta ? `<p class="doc-company-meta">${companyMeta}</p>` : ""}
        </div>
      </div>
      <div class="doc-header-right">
        <h2 class="doc-title">INVOICE</h2>
        <p class="doc-meta-line"><strong>No.</strong> ${escapeHtml(order.orderNo)}</p>
        <p class="doc-meta-line"><strong>Tanggal</strong> ${escapeHtml(formatDateId(order.orderDate))}</p>
      </div>
    </header>

    <div class="doc-body">
      <div class="doc-cards">
        <div class="doc-card">
          <p class="doc-card-label">Tagihan kepada</p>
          <p class="doc-card-value">${escapeHtml(customerName)}</p>
          ${customerMeta ? `<p class="doc-card-sub">${customerMeta}</p>` : ""}
        </div>
        <div class="doc-card">
          <p class="doc-card-label">Status pembayaran</p>
          <p class="doc-card-value">
            <span class="status-badge ${status.className}">${status.label}</span>
          </p>
          <p class="doc-card-sub">${escapeHtml(orderStatusNote(order.status))}</p>
        </div>
      </div>

      <table class="doc-table">
        <thead>
          <tr>
            <th class="center" style="width:36px;">#</th>
            <th>Produk / Jasa</th>
            <th class="center" style="width:52px;">Satuan</th>
            <th class="center" style="width:44px;">Qty</th>
            <th class="num" style="width:88px;">Harga</th>
            <th class="num" style="width:72px;">Diskon</th>
            <th class="num" style="width:96px;">Total</th>
          </tr>
        </thead>
        <tbody>${lineRows || `<tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af;">Tidak ada baris</td></tr>`}</tbody>
      </table>

      <div class="doc-footer-row">
        ${stamp}
        <div class="doc-summary">
          <div class="doc-summary-row"><span>Subtotal</span><span>${formatRp(subtotal)}</span></div>
          <div class="doc-summary-row"><span>Diskon</span><span>${totalDiskon > 0 ? `−${formatRp(totalDiskon)}` : "—"}</span></div>
          <div class="doc-summary-total">
            <span class="label">GRAND TOTAL</span>
            <span class="value">${formatRp(order.grandTotal)}</span>
          </div>
          <div class="doc-summary-row" style="margin-top:10px;"><span>Sudah dibayar</span><span>${formatRp(order.bayar)}</span></div>
          <div class="doc-summary-row doc-summary-due"><span>Sisa tagihan</span><span class="value">${formatRp(order.sisaTagihan)}</span></div>
        </div>
      </div>

      <div class="doc-thanks">
        <strong>Terima kasih atas kepercayaan Anda.</strong>
        Dokumen ini dicetak dari Premium Akuntansi · ${escapeHtml(formatDateId(new Date().toISOString().slice(0, 10)))}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function openInvoicePrintWindow(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");

  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Popup diblokir. Izinkan popup untuk cetak invoice.");
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
    setTimeout(triggerPrint, 400);
  } else {
    w.addEventListener("load", () => setTimeout(triggerPrint, 400), { once: true });
  }
}
