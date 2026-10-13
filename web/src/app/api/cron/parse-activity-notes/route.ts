import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rawNoteHash } from "@/lib/tennis/note-hash";
import { parseTennisNote, parseToRow, PARSE_MODEL } from "@/lib/tennis/parse-note";

/**
 * GET /api/cron/parse-activity-notes
 *
 * Runs daily via Vercel Cron. Claims pending rows from
 * workout_activity_notes, parses each workout's note through the tennis parse
 * contract, and writes the structured result back.
 *
 * Writes ONLY to workout_activity_notes. workouts.notes stays the source of
 * truth and is never modified, and the parse lifecycle lives entirely on this
 * table — which is why a bad batch can be re-run by setting rows back to
 * 'pending' without touching a single workout.
 *
 * Also safe to invoke by hand (same bearer token) after bumping
 * PROMPT_VERSION, since re-queued rows look exactly like new ones.
 */

// A note takes ~10-30s on opus. The batch is capped and the loop stops early
// rather than being cut off mid-write; whatever is left stays pending for the
// next run. 60s is the Hobby ceiling and well under Pro's.
export const maxDuration = 60;

/** Per run. Steady state is 0-1 notes a day; a backlog drains over a few runs. */
const BATCH = 10;
/** Stop claiming new work with this much of the budget left, so an in-flight
 *  parse can finish and be written instead of being killed. */
const RESERVE_MS = 20_000;

type PendingRow = {
  id: string;
  workout_id: string;
  activity: string;
  raw_note_hash: string;
};

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Stricter than the other cron routes on purpose: this one spends money on
  // the Anthropic API, so a missing secret fails closed instead of running open.
  if (!cronSecret) {
    console.error("[CRON] parse-activity-notes: CRON_SECRET is not set");
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[CRON] parse-activity-notes: ANTHROPIC_API_KEY is not set");
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  const startedAt = Date.now();
  const budgetLeft = () => maxDuration * 1000 - (Date.now() - startedAt);

  const { data: pending, error: pendingError } = await supabaseAdmin
    .from("workout_activity_notes")
    .select("id, workout_id, activity, raw_note_hash")
    .eq("status", "pending")
    .eq("activity", "tennis")
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (pendingError) {
    console.error("[CRON] parse-activity-notes: could not read pending rows:", pendingError.message);
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  const rows = (pending || []) as PendingRow[];
  console.log(`[CRON] parse-activity-notes: ${rows.length} pending (model ${PARSE_MODEL})`);
  if (rows.length === 0) {
    return NextResponse.json({ pending: 0, parsed: 0, skipped: 0, failed: 0, stale: 0, retrying: 0, deferred: 0 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let parsed = 0, skipped = 0, failed = 0, deferred = 0, stale = 0, retrying = 0;

  /**
   * Rate limits, overloads and connection drops are the API having a bad
   * minute, not the note being unparseable. Those leave the row 'pending' so
   * the next run picks it up; only terminal errors are recorded as failures,
   * because nothing re-claims a failed row on its own.
   */
  const isTransient = (e: unknown) =>
    e instanceof Anthropic.APIConnectionError ||
    (e instanceof Anthropic.APIError && (e.status === 429 || (e.status ?? 0) >= 500));

  for (const row of rows) {
    if (budgetLeft() < RESERVE_MS) {
      deferred = rows.length - (parsed + skipped + failed + stale + retrying);
      console.log(`[CRON] parse-activity-notes: out of budget, ${deferred} left pending`);
      break;
    }

    const { data: workout, error: workoutError } = await supabaseAdmin
      .from("workouts")
      .select("id, date, notes, rating")
      .eq("id", row.workout_id)
      .single();

    if (workoutError || !workout) {
      failed++;
      await recordFailure(row.id, `workout unreadable: ${workoutError?.message ?? "not found"}`);
      continue;
    }

    // The note as it reads RIGHT NOW, not as it read when the row was queued.
    // The hash computed here is what the write below is guarded on.
    const hashAtRead = await rawNoteHash(workout.notes);

    const { data: exerciseRows } = await supabaseAdmin
      .from("workout_exercises")
      .select("exercise_name_display")
      .eq("workout_id", row.workout_id);

    try {
      const parse = await parseTennisNote(client, {
        date: workout.date,
        notes: workout.notes,
        exercises: (exerciseRows || []).map(
          (e: { exercise_name_display: string | null }) => e.exercise_name_display || "",
        ),
        rating: workout.rating ?? null,
      });

      // Optimistic concurrency: if the note was edited while this parse was in
      // flight, the save path has already re-queued the row with a new hash.
      // Matching on the hash we actually parsed means the newer edit wins and
      // this result is discarded rather than silently marked current.
      const { data: written, error: writeError } = await supabaseAdmin
        .from("workout_activity_notes")
        .update(parseToRow(parse, hashAtRead))
        .eq("id", row.id)
        .eq("status", "pending")
        .eq("raw_note_hash", row.raw_note_hash)
        .select("id, status");

      if (writeError) {
        failed++;
        await recordFailure(row.id, `write failed: ${writeError.message}`);
        continue;
      }
      if (!written || written.length === 0) {
        stale++;
        console.log(`[CRON] parse-activity-notes: ${row.workout_id} changed mid-parse, result dropped`);
        continue;
      }

      if (written[0].status === "parsed") parsed++;
      else skipped++;
      console.log(
        `[CRON] parse-activity-notes: ${workout.date} ${row.workout_id} -> ${written[0].status}`,
      );
    } catch (e) {
      const message = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}`
        : e instanceof Error ? e.message : String(e);

      if (isTransient(e)) {
        retrying++;
        console.warn(`[CRON] parse-activity-notes: ${row.workout_id} left pending: ${message}`);
        continue;
      }

      failed++;
      console.error(`[CRON] parse-activity-notes: ${row.workout_id} failed: ${message}`);
      await recordFailure(row.id, message);
    }
  }

  const summary = { pending: rows.length, parsed, skipped, failed, stale, retrying, deferred,
    ms: Date.now() - startedAt };
  console.log(`[CRON] parse-activity-notes: ${JSON.stringify(summary)}`);
  return NextResponse.json(summary);
}

/**
 * Terminal failures only — a refusal, unparseable output, or a row that could
 * not be read or written. Nothing re-claims a 'failed' row automatically, so
 * this is deliberately a resting state: parse_error says what happened, and
 * editing the note (which re-queues it) or setting it back to 'pending' is how
 * it gets another attempt.
 */
async function recordFailure(id: string, message: string) {
  const { error } = await supabaseAdmin
    .from("workout_activity_notes")
    .update({
      status: "failed",
      parse_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) console.error(`[CRON] parse-activity-notes: could not record failure on ${id}: ${error.message}`);
}
