/**
 * Migration script: Convert "Raised Heel Squats" exercise records to plain "Squats"
 * and backfill the "Raised Heel" workout tag onto those workouts.
 *
 * Prerequisites:
 *   1. Deploy the workout_tags migration (20260304_workout_tags.sql)
 *   2. Create a "Raised Heel" tag in the Exercise Library → Tags tab
 *
 * Usage:
 *   node scripts/migrate-raised-heel-tags.mjs --dry-run   (preview without changes)
 *   node scripts/migrate-raised-heel-tags.mjs              (execute with confirmation prompt)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as readline from "readline";

config({ path: ".env" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const OWNER_ID = "f4fefe91-cb8d-4ae5-8a67-b59dead2572e";
const DRY_RUN = process.argv.includes("--dry-run");
const CHUNK = 200;

/** Paginated fetch helper */
async function fetchAll(table, select, filters = {}, extraQuery = null) {
  const rows = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    let query = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [key, val] of Object.entries(filters)) {
      query = query.eq(key, val);
    }
    if (extraQuery) query = extraQuery(query);
    const { data, error } = await query;
    if (error) throw new Error(`Fetch ${table} failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

async function main() {
  console.log(`\n── Raised Heel Squats Migration ${DRY_RUN ? "(DRY RUN)" : ""} ──\n`);

  // ── Step 1: Look up exercises ──
  console.log("1. Looking up exercises...");

  const { data: raisedHeelExercises } = await sb
    .from("exercises")
    .select("id, name")
    .eq("owner_id", OWNER_ID)
    .ilike("name", "%Raised Heel%Squat%");

  if (!raisedHeelExercises || raisedHeelExercises.length === 0) {
    console.log("   No 'Raised Heel Squats' exercise found. Nothing to do.");
    return;
  }
  const raisedHeelExercise = raisedHeelExercises[0];
  console.log(`   Raised Heel Squats exercise: ${raisedHeelExercise.name} (${raisedHeelExercise.id})`);

  const { data: squatExercises } = await sb
    .from("exercises")
    .select("id, name")
    .eq("owner_id", OWNER_ID)
    .ilike("name", "Squats");

  if (!squatExercises || squatExercises.length === 0) {
    // Try just "Squat" (singular)
    const { data: squat2 } = await sb
      .from("exercises")
      .select("id, name")
      .eq("owner_id", OWNER_ID)
      .ilike("name", "Squat");
    if (!squat2 || squat2.length === 0) {
      console.error("   ERROR: Could not find 'Squats' exercise. Aborting.");
      process.exit(1);
    }
    squatExercises?.push(...squat2);
  }
  const squatExercise = squatExercises[0];
  console.log(`   Squats exercise: ${squatExercise.name} (${squatExercise.id})`);

  // ── Step 2: Look up "Raised Heel" tag ──
  console.log("\n2. Looking up 'Raised Heel' workout tag...");

  const { data: tagRows } = await sb
    .from("workout_tags")
    .select("id, name")
    .eq("owner_id", OWNER_ID)
    .ilike("name", "Raised Heel")
    .limit(1);

  if (!tagRows || tagRows.length === 0) {
    console.error("   ERROR: 'Raised Heel' tag not found.");
    console.error("   Please create it first in the Exercise Library → Tags tab.");
    process.exit(1);
  }
  const raisedHeelTag = tagRows[0];
  console.log(`   Tag: ${raisedHeelTag.name} (${raisedHeelTag.id})`);

  // ── Step 3: Find affected workout_exercises ──
  console.log("\n3. Finding affected workout_exercises...");

  const affectedExercises = await fetchAll(
    "workout_exercises",
    "id, workout_id, exercise_name_display, exercise_id",
    {},
    (q) => q.ilike("exercise_name_display", "%Raised Heel%Squat%").gte("created_at", "2024-01-01")
  );

  console.log(`   Found ${affectedExercises.length} workout_exercise rows`);

  const uniqueWorkoutIds = [...new Set(affectedExercises.map((r) => r.workout_id))];
  console.log(`   Affecting ${uniqueWorkoutIds.length} unique workouts`);

  if (uniqueWorkoutIds.length === 0) {
    console.log("   Nothing to migrate.");
    return;
  }

  // Show sample
  console.log("\n   Sample workout_exercise rows:");
  for (const ex of affectedExercises.slice(0, 5)) {
    console.log(`     workout_id=${ex.workout_id.slice(0, 8)}... display="${ex.exercise_name_display}"`);
  }
  if (affectedExercises.length > 5) {
    console.log(`     ... and ${affectedExercises.length - 5} more`);
  }

  // ── Step 4: Find affected workout_sets ──
  console.log("\n4. Finding affected workout_sets...");
  const affectedSets = await fetchAll(
    "workout_sets",
    "id, workout_id, exercise_name_display",
    {},
    (q) => q.ilike("exercise_name_display", "%Raised Heel%Squat%")
  );
  console.log(`   Found ${affectedSets.length} workout_set rows`);

  if (DRY_RUN) {
    console.log("\n── DRY RUN SUMMARY ──");
    console.log(`  Would tag ${uniqueWorkoutIds.length} workouts with "${raisedHeelTag.name}"`);
    console.log(`  Would update ${affectedExercises.length} workout_exercise rows → "${squatExercise.name}"`);
    console.log(`  Would update ${affectedSets.length} workout_set rows → "${squatExercise.name}"`);
    console.log(`  Would archive exercise "${raisedHeelExercise.name}"`);
    console.log("\nRun without --dry-run to execute.");
    return;
  }

  // ── Confirm ──
  const ok = await confirm(`\nProceed? This will modify ${uniqueWorkoutIds.length} workouts. (y/N): `);
  if (!ok) {
    console.log("Aborted.");
    return;
  }

  // ── Step 5: Insert workout_applied_tags ──
  console.log("\n5. Inserting workout_applied_tags...");
  let tagInsertCount = 0;
  for (const ids of chunk(uniqueWorkoutIds, CHUNK)) {
    const rows = ids.map((wid) => ({ workout_id: wid, tag_id: raisedHeelTag.id }));
    const { error } = await sb.from("workout_applied_tags").insert(rows, { onConflict: "workout_id,tag_id" });
    if (error) console.error(`   Insert error: ${error.message}`);
    else tagInsertCount += rows.length;
  }
  console.log(`   Inserted ${tagInsertCount} tag rows`);

  // ── Step 6: Update workout_exercises ──
  console.log("\n6. Updating workout_exercise rows...");
  const exerciseIds = affectedExercises.map((r) => r.id);
  let exUpdateCount = 0;
  for (const ids of chunk(exerciseIds, CHUNK)) {
    const { error } = await sb
      .from("workout_exercises")
      .update({
        exercise_id: squatExercise.id,
        exercise_name_display: squatExercise.name,
        modifier_ids: [],
      })
      .in("id", ids);
    if (error) console.error(`   Update error: ${error.message}`);
    else exUpdateCount += ids.length;
  }
  console.log(`   Updated ${exUpdateCount} workout_exercise rows`);

  // ── Step 7: Update workout_sets ──
  console.log("\n7. Updating workout_set rows...");
  const setIds = affectedSets.map((r) => r.id);
  let setUpdateCount = 0;
  for (const ids of chunk(setIds, CHUNK)) {
    const { error } = await sb
      .from("workout_sets")
      .update({
        exercise_id: squatExercise.id,
        exercise_name_display: squatExercise.name,
        modifier_ids: [],
      })
      .in("id", ids);
    if (error) console.error(`   Update error: ${error.message}`);
    else setUpdateCount += ids.length;
  }
  console.log(`   Updated ${setUpdateCount} workout_set rows`);

  // ── Step 8: Archive the Raised Heel Squats exercise ──
  console.log("\n8. Archiving exercise...");
  const { error: archiveError } = await sb
    .from("exercises")
    .update({ is_archived: true })
    .eq("id", raisedHeelExercise.id)
    .eq("owner_id", OWNER_ID);
  if (archiveError) {
    console.error(`   Archive error: ${archiveError.message}`);
  } else {
    console.log(`   Archived "${raisedHeelExercise.name}"`);
  }

  // ── Summary ──
  console.log("\n── Migration Complete ──");
  console.log(`  Tagged workouts:            ${tagInsertCount}`);
  console.log(`  workout_exercise rows fixed: ${exUpdateCount}`);
  console.log(`  workout_set rows fixed:      ${setUpdateCount}`);
  console.log(`  Exercise archived:           ${raisedHeelExercise.name}`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
