export function poDebtStatusLabel(status: string, sisaTagihan = 0): string {
  if (status === "CONFIRMED") return "Belum jurnal";
  if (status === "POSTED") {
    return sisaTagihan > 0 ? "Jurnal OK · belum lunas" : "Lunas";
  }
  if (status === "VOIDED") return "Dibatalkan";
  return status;
}

export function confirmPostPoJournal(poNo: string, sisaTagihan?: number): boolean {
  const sisaText =
    sisaTagihan != null && sisaTagihan > 0
      ? `\n\nSisa hutang Rp ${sisaTagihan.toLocaleString("id-ID")} tetap perlu dibayar lewat pelunasan.`
      : "";
  return window.confirm(
    `Posting jurnal expense untuk ${poNo}?${sisaText}\n\nPosting = catat transaksi ke buku besar, bukan pelunasan hutang.\n\nLanjutkan?`
  );
}
