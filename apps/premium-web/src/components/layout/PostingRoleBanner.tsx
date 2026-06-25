export function PostingRoleBanner({ canPost }: { canPost: boolean }) {
  if (canPost) return null;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      Posting dan pembatalan jurnal hanya oleh <strong>akuntan</strong> atau <strong>owner</strong>.
      Anda tetap bisa mencatat transaksi; menunggu posting dari tim akuntansi.
    </div>
  );
}
