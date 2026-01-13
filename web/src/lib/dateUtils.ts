/**
 * Shared date utilities for consistent timezone handling.
 * All functions use LOCAL timezone to avoid UTC vs local mismatches.
 */

/**
 * Returns a date as YYYY-MM-DD string in the user's local timezone.
 * @param date - Date object (defaults to now)
 * @returns YYYY-MM-DD formatted string
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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
