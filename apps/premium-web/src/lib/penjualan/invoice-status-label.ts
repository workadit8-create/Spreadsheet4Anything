export function invoiceDebtStatusLabel(status: string, sisaTagihan = 0): string {
  if (status === "CONFIRMED") return "Belum jurnal";
  if (status === "POSTED") {
    return sisaTagihan > 0 ? "Jurnal OK · belum lunas" : "Lunas";
  }
  if (status === "VOIDED") return "Dibatalkan";
  return status;
}

export function confirmPostInvoiceJournal(invoiceNo: string, sisaTagihan?: number): boolean {
  const sisaText =
    sisaTagihan != null && sisaTagihan > 0
      ? `\n\nSisa piutang Rp ${sisaTagihan.toLocaleString("id-ID")} tetap perlu dibayar lewat pelunasan.`
      : "";
  return window.confirm(
    `Posting jurnal penjualan untuk ${invoiceNo}?${sisaText}\n\nPosting = catat transaksi ke buku besar, bukan pelunasan piutang.\n\nLanjutkan?`
  );
}
