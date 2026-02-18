/**
 * Shared date utilities for consistent timezone handling.
 * On the client, uses the browser's local timezone.
 * On the server, reads the `tz` cookie (set by the client), falling back
 * to USER_TIMEZONE env var or America/New_York.
 */

/**
 * Reads the user's timezone from the `tz` cookie on the server.
 * Must be awaited from an async server context (API routes, Server Components).
 * On the client, returns the browser's local timezone (not used in practice).
 */
export async function getServerTimezone(): Promise<string> {
  if (typeof window !== "undefined") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const tz = cookieStore.get("tz")?.value;
    if (tz) return decodeURIComponent(tz);
  } catch {
    // Not in a request context (e.g., build time)
  }
  return process.env.USER_TIMEZONE || "America/New_York";
}

/**
 * Returns a date as YYYY-MM-DD string in the user's timezone.
 * On the client, uses the browser's local timezone (tz param ignored).
 * On the server, pass the tz from `await getServerTimezone()`.
 * @param date - Date object (defaults to now)
 * @param tz - Timezone string for server-side formatting (e.g., "America/New_York")
 * @returns YYYY-MM-DD formatted string
 */
export function getLocalDateString(date: Date = new Date(), tz?: string): string {
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
 * Pure calendar arithmetic — no timezone conversion needed.
 * @param isoDate - Date string in YYYY-MM-DD format
 * @param deltaDays - Number of days to add (negative to subtract)
 * @returns New date as YYYY-MM-DD string
 */
export function addDays(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Compares two YYYY-MM-DD date strings.
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
