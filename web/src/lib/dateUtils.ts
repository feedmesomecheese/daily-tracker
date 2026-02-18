/**
 * Shared date utilities for consistent timezone handling.
 * On the client, uses the browser's local timezone.
 * On the server, reads the `tz` cookie (set by the client), falling back
 * to USER_TIMEZONE env var or America/New_York.
 */

/**
 * Reads the user's timezone from the `tz` cookie on the server.
 * Returns undefined on the client (browser uses local timezone automatically).
 */
function getServerTimezone(): string | undefined {
  if (typeof window !== "undefined") return undefined;
  try {
    // Dynamic import to avoid bundling next/headers on the client
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cookies } = require("next/headers");
    const cookieStore = cookies();
    const tz = cookieStore.get("tz")?.value;
    if (tz) return decodeURIComponent(tz);
  } catch {
    // Not in a request context (e.g., build time)
  }
  return process.env.USER_TIMEZONE || "America/New_York";
}

/**
 * Returns a date as YYYY-MM-DD string in the user's timezone.
 * On the client, uses the browser's local timezone.
 * On the server, reads the user's timezone from the `tz` cookie.
 * @param date - Date object (defaults to now)
 * @returns YYYY-MM-DD formatted string
 */
export function getLocalDateString(date: Date = new Date()): string {
  const tz = getServerTimezone();
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  }).formatToParts(date);
  const year = parts.find(p => p.type === "year")!.value;
  const month = parts.find(p => p.type === "month")!.value;
  const day = parts.find(p => p.type === "day")!.value;
  return `${year}-${month}-${day}`;
}

/**
 * Adds or subtracts days from a YYYY-MM-DD string.
 * @param isoDate - Date string in YYYY-MM-DD format
 * @param deltaDays - Number of days to add (negative to subtract)
 * @returns New date as YYYY-MM-DD string
 */
export function addDays(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + deltaDays);
  return getLocalDateString(d);
}

/**
 * Compares two YYYY-MM-DD date strings.
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
