import QRCode from "qrcode";
import { escapeHtml } from "@/lib/org/print-utils";
import { buildAssetQrUrl } from "@/lib/assets/qr-url";

export type AssetLabelInput = {
  id: string;
  code: string | null;
  name: string;
  category: string;
};

async function qrDataUrlForAsset(assetId: string, baseUrl: string): Promise<string> {
  const url = buildAssetQrUrl(assetId, baseUrl);
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 112,
    errorCorrectionLevel: "M"
  });
}

function labelCss(): string {
  return `
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 11px;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet-title {
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 6mm;
      color: #334155;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3mm;
    }
    .label {
      border: 1px dashed #94a3b8;
      border-radius: 4px;
      padding: 3mm;
      text-align: center;
      page-break-inside: avoid;
      min-height: 42mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5mm;
    }
    .label img {
      width: 28mm;
      height: 28mm;
      object-fit: contain;
    }
    .code {
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.04em;
    }
    .name {
      font-size: 10px;
      line-height: 1.25;
      max-height: 2.5em;
      overflow: hidden;
      word-break: break-word;
    }
    .meta {
      font-size: 9px;
      color: #64748b;
    }
    .company {
      font-size: 8px;
      color: #94a3b8;
      margin-top: 1mm;
    }
    @media print {
      .no-print { display: none; }
    }
  `;
}

function renderLabelBlock(
  asset: AssetLabelInput,
  qrDataUrl: string,
  companyName: string
): string {
  const code = asset.code || asset.id.slice(0, 8).toUpperCase();
  return `
    <div class="label">
      <img src="${qrDataUrl}" alt="QR ${escapeHtml(code)}" />
      <div class="code">${escapeHtml(code)}</div>
      <div class="name">${escapeHtml(asset.name)}</div>
      <div class="meta">${escapeHtml(asset.category)}</div>
      ${companyName ? `<div class="company">${escapeHtml(companyName)}</div>` : ""}
    </div>
  `;
}

export async function buildAssetLabelsPrintHtml(
  items: AssetLabelInput[],
  companyName: string,
  baseUrl: string
): Promise<string> {
  const blocks = await Promise.all(
    items.map(async (asset) => {
      const qr = await qrDataUrlForAsset(asset.id, baseUrl);
      return renderLabelBlock(asset, qr, companyName);
    })
  );

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Label QR Aset</title>
  <style>${labelCss()}</style>
</head>
<body>
  <p class="sheet-title no-print">Label QR Aset — ${items.length} lembar (potong garis putus-putus)</p>
  <div class="grid">${blocks.join("")}</div>
</body>
</html>`;
}

export async function buildSingleAssetLabelPrintHtml(
  asset: AssetLabelInput,
  companyName: string,
  baseUrl: string
): Promise<string> {
  return buildAssetLabelsPrintHtml([asset], companyName, baseUrl);
}

export function openAssetLabelPrintWindow(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");

  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Popup diblokir. Izinkan popup untuk cetak label.");
  }

  const triggerPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      // window may be closed
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (w.document?.readyState === "complete") {
    setTimeout(triggerPrint, 300);
  } else {
    w.addEventListener("load", () => setTimeout(triggerPrint, 300), { once: true });
  }
}
