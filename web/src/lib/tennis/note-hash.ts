/**
 * The `raw_note_hash` contract.
 *
 * A stored parse is stale when the note text it was taken from has changed.
 * That test only works if every producer hashes the note the same way, so the
 * rule lives here and nowhere else: the backfill, the cron parser, and the
 * "mark this workout pending" path all call this function.
 *
 * Deliberately hashes the note EXACTLY as stored — no trimming, no whitespace
 * collapsing. A note edited to only change spacing is still an edit, and
 * re-parsing it is cheap. (Note that the backfill's workout *binding* did
 * collapse whitespace to match the extract against the live rows; that is a
 * one-off matching concern and intentionally not this contract.)
 *
 * Web Crypto rather than node:crypto so this is callable from a route handler
 * on either runtime. It is async as a result.
 */

/** sha256 of the note text, lowercase hex. A null/absent note hashes as "". */
export async function rawNoteHash(notes: string | null | undefined): Promise<string> {
  const bytes = new TextEncoder().encode(notes ?? "");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Whether a stored parse needs re-running: the note changed, or the contract did.
 * Pass the row's stored hash/version and the note as it reads right now.
 */
export async function isParseStale(
  stored: { raw_note_hash: string | null; prompt_version: number | null },
  currentNotes: string | null | undefined,
  currentPromptVersion: number,
): Promise<boolean> {
  if (stored.prompt_version !== currentPromptVersion) return true;
  if (!stored.raw_note_hash) return true;
  return stored.raw_note_hash !== (await rawNoteHash(currentNotes));
}
