export const ORG_LOGO_BUCKET = "org-assets";

const LOGO_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_ALLOWED_MIME = Object.keys(LOGO_MIME_EXT);

export function orgLogoStoragePath(orgId: string, mimeType: string): string | null {
  const ext = LOGO_MIME_EXT[mimeType];
  if (!ext) return null;
  return `${orgId}/logo.${ext}`;
}

export function orgLogoPublicUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${ORG_LOGO_BUCKET}/${logoPath}`;
}

export function orgLogoPrefix(orgId: string): string {
  return `${orgId}/logo`;
}
