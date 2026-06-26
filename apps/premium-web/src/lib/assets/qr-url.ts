/** URL yang di-encode di QR — buka detail aset (perlu login). */
export function buildAssetQrUrl(assetId: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/dashboard/aset/${assetId}`;
}
