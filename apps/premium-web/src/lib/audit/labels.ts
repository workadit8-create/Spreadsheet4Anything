import type { AuditAction } from "@/lib/audit/log";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "sales_order.post": "Post invoice penjualan",
  "sales_order.void": "Batal invoice penjualan",
  "purchase_order.post": "Post pembelian (PO)",
  "purchase_order.void": "Batal pembelian (PO)",
  "piutang_payment.post": "Post pelunasan piutang",
  "piutang_payment.void": "Batal pelunasan piutang",
  "hutang_payment.post": "Post pelunasan hutang",
  "hutang_payment.void": "Batal pelunasan hutang",
  "cash_transfer.post": "Post mutasi kas/bank",
  "cash_transfer.void": "Batal mutasi kas/bank",
  "journal.manual": "Jurnal manual",
  "posting.process": "Proses antrian posting",
  "member.add": "Tambah anggota tim",
  "member.role_update": "Ubah peran anggota",
  "member.remove": "Hapus anggota tim",
  "org.profile_update": "Ubah profil usaha",
  "org.logo_update": "Unggah logo usaha",
  "org.logo_delete": "Hapus logo usaha",
  "org.ppn_update": "Ubah pengaturan PPN",
  "org.tax_update": "Ubah pengaturan pajak"
};

export function formatAuditMetadataSummary(
  action: AuditAction,
  metadata: Record<string, unknown>
): string {
  const orderNo = metadata.orderNo ? String(metadata.orderNo) : "";
  const poNo = metadata.poNo ? String(metadata.poNo) : "";
  const invoiceNo = metadata.invoiceNo ? String(metadata.invoiceNo) : "";
  const transferNo = metadata.transferNo ? String(metadata.transferNo) : "";
  const docNo = metadata.docNo ? String(metadata.docNo) : "";
  const email = metadata.email ? String(metadata.email) : "";
  const role = metadata.role ? String(metadata.role) : "";
  const reason = metadata.reason ? String(metadata.reason) : "";

  const parts: string[] = [];
  if (orderNo) parts.push(`Invoice ${orderNo}`);
  if (poNo) parts.push(`PO ${poNo}`);
  if (invoiceNo) parts.push(`Ref ${invoiceNo}`);
  if (transferNo) parts.push(`Mutasi ${transferNo}`);
  if (docNo) parts.push(`Jurnal ${docNo}`);
  if (email) parts.push(email);
  if (role) parts.push(`→ ${role}`);
  if (metadata.processed != null) parts.push(`${metadata.processed} job diproses`);
  if (reason) parts.push(`Alasan: ${reason}`);

  if (parts.length) return parts.join(" · ");

  if (action === "org.profile_update" && metadata.companyName) {
    return String(metadata.companyName);
  }

  if (action === "org.ppn_update" || action === "org.tax_update") {
    const type = metadata.activeType ? String(metadata.activeType).toUpperCase() : "";
    const pkp = metadata.pkpEnabled ? "PKP aktif" : "Non-PKP";
    const pb = metadata.pbEnabled ? `PB ${metadata.pbRatePercent ?? ""}%` : "";
    return [type, pkp, pb].filter(Boolean).join(" · ") || pkp;
  }

  const keys = Object.keys(metadata);
  if (!keys.length) return "—";
  return keys
    .slice(0, 3)
    .map((k) => `${k}: ${String(metadata[k])}`)
    .join(" · ");
}
