/**
 * The section list and its display order — the one place either is defined.
 *
 * Split out of parse-contract.ts deliberately: parse-contract builds a zod
 * schema at module scope, so importing it from a client component would pull
 * zod into the browser bundle (a top-level `z.object(...)` call is not
 * tree-shakeable). The read UI needs only the order and the labels, so those
 * live here with no dependencies. parse-contract re-exports SECTION_KEYS, and
 * the stored `sections` JSONB deliberately does not duplicate the key set.
 */

export const SECTION_KEYS = [
  "general",
  "serves",
  "forehand",
  "backhand",
  "net",
  "overheads",
  "lobs",
  "equipment",
  "mental",
  "body",
  "conditions",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** Display labels. Keys that aren't here fall back to the raw key, so a future
 *  activity can add sections without touching this file to render at all. */
export const SECTION_LABELS: Record<SectionKey, string> = {
  general: "General",
  serves: "Serves",
  forehand: "Forehand",
  backhand: "Backhand",
  net: "Net",
  overheads: "Overheads",
  lobs: "Lobs",
  equipment: "Equipment",
  mental: "Mental",
  body: "Body",
  conditions: "Conditions",
};

/** Orders arbitrary stored keys by SECTION_KEYS, with unknown keys last
 *  (alphabetically) rather than dropped — the JSONB column is schemaless. */
export function orderSectionKeys(keys: string[]): string[] {
  const rank = new Map<string, number>(SECTION_KEYS.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ra === rb ? a.localeCompare(b) : ra - rb;
  });
}

export function sectionLabel(key: string): string {
  return SECTION_LABELS[key as SectionKey] ?? key;
}
