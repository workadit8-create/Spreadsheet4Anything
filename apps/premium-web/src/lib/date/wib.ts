/** Tanggal & jam operasional — zona Asia/Jakarta (WIB). */

export function wibTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function wibCurrentHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "numeric",
    hour12: false
  }).format(now);
  return Number(hour);
}

export function wibDateIsoFromInput(value: string | undefined | null, fallback = wibTodayIso()): string {
  const trimmed = String(value || "").trim().slice(0, 10);
  return trimmed || fallback;
}

/** Tanggal 1 di bulan berjalan (WIB), format YYYY-MM-DD */
export function wibMonthStartIso(now = new Date()): string {
  const today = wibTodayIso(now);
  return `${today.slice(0, 7)}-01`;
}

/** N bulan sebelum hari ini (WIB), format YYYY-MM-DD */
export function wibMonthsAgoIso(months: number, now = new Date()): string {
  const today = wibTodayIso(now);
  const base = new Date(`${today}T12:00:00+07:00`);
  base.setMonth(base.getMonth() - months);
  return wibTodayIso(base);
}

export function addDaysIso(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T12:00:00+07:00`);
  base.setDate(base.getDate() + days);
  return wibTodayIso(base);
}

export function formatWibDateLabel(isoDate: string, now = new Date()): string {
  const today = wibTodayIso(now);
  if (isoDate === today) return "hari ini";
  try {
    return new Date(`${isoDate}T12:00:00+07:00`).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return isoDate;
  }
}

export function formatWibDateTimeLabel(now = new Date()): string {
  return now.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** @deprecated Prefer wibTodayIso — UTC date caused off-by-one before midnight WIB */
export function utcTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
