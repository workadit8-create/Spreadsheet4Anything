/** Platform admin — satu-satunya yang boleh mengaktifkan add-on per org (bukan owner client). */

function parseAdminEmails(): string[] {
  const raw =
    process.env.PLATFORM_ADMIN_EMAILS ||
    process.env.LAB_USER_EMAIL ||
    "";
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return parseAdminEmails().includes(normalized);
}
