import { escapeHtml } from "@/lib/org/print-utils";

export type PrintCompanyHeader = {
  name: string;
  address?: string;
  phone?: string;
  logoUrl?: string | null;
};

export function buildPrintCompanyHeader(company: PrintCompanyHeader): string {
  const logo = company.logoUrl
    ? `<img src="${escapeHtml(company.logoUrl)}" alt="Logo" style="display:block;max-height:56px;max-width:180px;object-fit:contain;margin-bottom:8px;" />`
    : "";

  return `${logo}
  <h1 style="font-size:20px;margin:0 0 4px;">${escapeHtml(company.name)}</h1>
  ${company.address ? `<p class="muted" style="color:#6b7280;font-size:13px;margin:0;">${escapeHtml(company.address)}</p>` : ""}
  ${company.phone ? `<p class="muted" style="color:#6b7280;font-size:13px;margin:4px 0 0;">${escapeHtml(company.phone)}</p>` : ""}`;
}
