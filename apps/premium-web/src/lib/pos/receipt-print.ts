import { escapeHtml, formatRp, printDocumentBaseCss } from "@/lib/org/print-utils";

export type PosReceiptLine = {
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  note?: string;
};

export type PosReceiptData = {
  orgName: string;
  receiptNo: string;
  dateLabel: string;
  cashierLabel?: string;
  lines: PosReceiptLine[];
  subtotal: number;
  total: number;
  bayar: number;
  change: number;
  paymentMethod: string;
  offline?: boolean;
};

export function buildPosReceiptHtml(data: PosReceiptData): string {
  const rows = data.lines
    .map(
      (line) => `<tr>
        <td style="padding:4px 0;border-bottom:1px dashed #e2e8f0;">
          <div style="font-weight:600;">${escapeHtml(line.name)}</div>
          ${line.note ? `<div style="font-size:11px;color:#64748b;">${escapeHtml(line.note)}</div>` : ""}
          <div style="font-size:11px;color:#64748b;">${line.qty} x ${formatRp(line.unit_price)}</div>
        </td>
        <td style="padding:4px 0;border-bottom:1px dashed #e2e8f0;text-align:right;vertical-align:top;">${formatRp(line.line_total)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Struk ${escapeHtml(data.receiptNo)}</title>
<style>${printDocumentBaseCss()}
body{font-family:system-ui,sans-serif;max-width:320px;margin:0 auto;padding:16px;font-size:13px;}
h1{font-size:16px;margin:0 0 4px;text-align:center;}
.meta{text-align:center;font-size:11px;color:#64748b;margin-bottom:12px;}
table{width:100%;border-collapse:collapse;}
.totals{margin-top:12px;border-top:2px solid #0f172a;padding-top:8px;}
.row{display:flex;justify-content:space-between;margin:4px 0;}
.grand{font-size:16px;font-weight:700;}
.footer{margin-top:16px;text-align:center;font-size:11px;color:#64748b;}
</style></head><body>
<h1>${escapeHtml(data.orgName)}</h1>
<div class="meta">
  <div>${escapeHtml(data.receiptNo)}</div>
  <div>${escapeHtml(data.dateLabel)}</div>
  ${data.cashierLabel ? `<div>Kasir: ${escapeHtml(data.cashierLabel)}</div>` : ""}
  ${data.offline ? `<div style="color:#b45309;">OFFLINE — sync saat online</div>` : ""}
</div>
<table><tbody>${rows}</tbody></table>
<div class="totals">
  <div class="row"><span>Total</span><span class="grand">${formatRp(data.total)}</span></div>
  <div class="row"><span>Bayar (${escapeHtml(data.paymentMethod)})</span><span>${formatRp(data.bayar)}</span></div>
  <div class="row"><span>Kembalian</span><span>${formatRp(data.change)}</span></div>
</div>
<div class="footer">Terima kasih</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

export function openPosReceiptPrint(data: PosReceiptData): void {
  const html = buildPosReceiptHtml(data);
  const w = window.open("", "_blank", "width=400,height=640");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
