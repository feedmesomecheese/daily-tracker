import type { SupabaseClient } from "@supabase/supabase-js";
import { rawNoteHash } from "@/lib/tennis/note-hash";
import { PROMPT_VERSION } from "@/lib/tennis/parse-contract";

/**
 * Queues a workout's note for activity parsing.
 *
 * Called on every workout create and update, from the shared write path so the
 * web UI, the API and the agent tools all go through it. It writes ONLY to
 * workout_activity_notes — `workouts` is never updated by this feature, and
 * workouts.notes stays the single source of truth that every row here derives
 * from.
 *
 * Deliberately additive and never fatal:
 *
 *  - It only ever adds or re-queues rows. The absence of a tennis signal does
 *    not mean "not tennis": of the 122 backfilled sessions, 96 are detectable
 *    through activity_sessions, 18 through an exercise named Tennis, and 8
 *    through neither (the note is the only evidence). So a missing signal
 *    never removes or invalidates an existing parse.
 *
 *  - A failure here must not fail the workout save. The note is already
 *    persisted; the parse is derived data that can be re-queued later.
 */

/** Activities we have a parse contract for, and the names that imply them. */
const ACTIVITY_SIGNALS: { activity: string; pattern: RegExp }[] = [
  { activity: "tennis", pattern: /\btennis\b/i },
];

type ParseQueueOutcome =
  | { action: "none"; reason: string }
  | { action: "inserted" | "requeued" | "retired"; activity: string };

/**
 * Which activities this workout looks like, from its logged structure.
 *
 * Both shapes are checked because they are different eras of the same thing:
 * sport entries used to be written to activity_sessions, and are now written
 * as a workout_exercises row named after the sport.
 */
async function detectActivities(
  db: SupabaseClient,
  workoutId: string,
): Promise<string[]> {
  const [{ data: exercises }, { data: sessions }] = await Promise.all([
    db.from("workout_exercises").select("exercise_name_display").eq("workout_id", workoutId),
    db.from("activity_sessions").select("activity_type").eq("workout_id", workoutId),
  ]);

  const names = [
    ...(exercises || []).map((e: { exercise_name_display: string | null }) => e.exercise_name_display || ""),
    ...(sessions || []).map((s: { activity_type: string | null }) => s.activity_type || ""),
  ];

  return ACTIVITY_SIGNALS.filter(({ pattern }) => names.some((n) => pattern.test(n))).map(
    ({ activity }) => activity,
  );
}

export async function queueActivityNoteParse(
  db: SupabaseClient,
  ownerId: string,
  workoutId: string,
  notes: string | null | undefined,
): Promise<ParseQueueOutcome[]> {
  const outcomes: ParseQueueOutcome[] = [];

  try {
    const hash = await rawNoteHash(notes);
    const hasNote = (notes ?? "").trim().length > 0;

    const { data: existingRows, error: readError } = await db
      .from("workout_activity_notes")
      .select("id, activity, status, raw_note_hash, prompt_version, duplicate_of_workout_id")
      .eq("workout_id", workoutId);

    // Before 20261012_workout_activity_notes.sql is applied this errors, and a
    // workout save must still succeed. Same tolerance as the GET path.
    if (readError) {
      console.warn(`[activity-notes] skipped queueing for ${workoutId}: ${readError.message}`);
      return [{ action: "none", reason: `read failed: ${readError.message}` }];
    }

    const existing = existingRows || [];

    // 1. Re-queue rows whose note text (or contract) no longer matches.
    for (const row of existing) {
      // The durable marker on the losing half of a double-logged session.
      // Re-queueing it would produce a second parse of the same session, which
      // is the exact thing the marker exists to prevent.
      if (row.status === "skipped" && row.duplicate_of_workout_id) continue;

      // A row already waiting on the current note needs nothing; otherwise the
      // note text or the contract has moved on and the parse is stale.
      const noteMatches = row.raw_note_hash === hash;
      if (noteMatches && (row.status === "pending" || row.prompt_version === PROMPT_VERSION)) continue;

      // Derived fields describe text that has changed, so they go with it
      // rather than lingering as a parse of a note that no longer reads that
      // way. An emptied note has nothing left to parse: retire the row instead
      // of queueing a parse of "".
      const { error } = await db
        .from("workout_activity_notes")
        .update({
          status: hasNote ? "pending" : "skipped",
          raw_note_hash: hash,
          parse_error: null,
          parsed_at: null,
          parser: null,
          prompt_version: null,
          source_excerpt: null,
          confidence: null,
          result: null,
          score: null,
          format: null,
          league: null,
          surface: null,
          partner: null,
          opponent: null,
          sections: {},
          is_activity_session: hasNote,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (error) {
        console.warn(`[activity-notes] re-queue failed for ${row.activity} on ${workoutId}: ${error.message}`);
        outcomes.push({ action: "none", reason: `re-queue failed: ${error.message}` });
      } else {
        outcomes.push({ action: hasNote ? "requeued" : "retired", activity: row.activity });
      }
    }

    // 2. Queue activities this workout newly looks like.
    if (!hasNote) return outcomes.length ? outcomes : [{ action: "none", reason: "no note" }];

    const detected = await detectActivities(db, workoutId);
    const already = new Set(existing.map((r) => r.activity));
    const toInsert = detected.filter((a) => !already.has(a));

    if (toInsert.length === 0) {
      if (outcomes.length === 0) {
        outcomes.push({ action: "none", reason: detected.length ? "already queued" : "no activity signal" });
      }
      return outcomes;
    }

    const { error } = await db.from("workout_activity_notes").insert(
      toInsert.map((activity) => ({
        workout_id: workoutId,
        owner_id: ownerId,
        activity,
        status: "pending",
        raw_note_hash: hash,
      })),
    );

    if (error) {
      console.warn(`[activity-notes] insert failed for ${workoutId}: ${error.message}`);
      outcomes.push({ action: "none", reason: `insert failed: ${error.message}` });
    } else {
      for (const activity of toInsert) outcomes.push({ action: "inserted", activity });
    }

    return outcomes;
  } catch (e) {
    // Derived data. Never let it take the workout save down with it.
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[activity-notes] queueing threw for ${workoutId}: ${message}`);
    return [{ action: "none", reason: `threw: ${message}` }];
  }
}
