/**
 * One-off script to import workout history from CSV exports.
 *
 * Usage:
 *   node scripts/import-workout-history.mjs
 *
 * Reads from C:\Users\merri\Downloads\:
 *   - LogForExport20260215.csv (main lifting log)
 *   - TennisForExport20260215.csv (tennis activity sessions)
 *   - RacquetballForExport20260215.csv (racquetball activity sessions)
 *   - OtherActivitiesForExport20260215.csv (other sport activity sessions)
 *
 * Requires .env to be loaded (uses NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 */

import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ─── Helpers ───────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

/** Batch insert with chunking (Supabase has row limits per request) */
async function batchInsert(table, rows, chunkSize = 500) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      console.error(`  Batch insert error on ${table} (rows ${i}-${i + chunk.length}): ${error.message}`);
      // Try one-by-one for this chunk to identify bad rows
      for (const row of chunk) {
        const { error: singleErr } = await supabase.from(table).insert(row);
        if (singleErr) {
          console.error(`    Row error: ${JSON.stringify(row).substring(0, 200)}: ${singleErr.message}`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += chunk.length;
    }
  }
  return inserted;
}

// ─── CSV Parsing ───────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

// ─── Date Parsing ──────────────────────────────────────────────

function parseDate(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const m = parts[0].padStart(2, "0");
  const d = parts[1].padStart(2, "0");
  const y = parts[2];
  return `${y}-${m}-${d}`;
}

// ─── Get user ──────────────────────────────────────────────────

async function getOwner() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw new Error(`Failed to list users: ${error.message}`);
  if (!data.users.length) throw new Error("No users found");
  const sorted = data.users.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  console.log(
    `Found ${sorted.length} users. Using: ${sorted[0].email} (${sorted[0].id})`
  );
  return sorted[0].id;
}

// ─── Main Import ───────────────────────────────────────────────

async function main() {
  const ownerId = await getOwner();

  // ── Step 1: Delete existing workouts ──
  console.log("\n── Deleting existing workouts... ──");
  const { error: delErr, count: delCount } = await supabase
    .from("workouts")
    .delete({ count: "exact" })
    .eq("owner_id", ownerId);
  if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
  console.log(`  Deleted ${delCount ?? 0} existing workouts`);

  // Also delete any imported exercises from a previous run
  const { data: importedGroupCheck } = await supabase
    .from("exercise_groups")
    .select("id")
    .eq("owner_id", ownerId)
    .ilike("name", "imported");
  if (importedGroupCheck?.length) {
    const gid = importedGroupCheck[0].id;
    const { count: delExCount } = await supabase
      .from("exercises")
      .delete({ count: "exact" })
      .eq("owner_id", ownerId)
      .eq("is_archived", true)
      .contains("group_ids", [gid]);
    console.log(`  Deleted ${delExCount ?? 0} previously imported exercises`);
    await supabase.from("exercise_groups").delete().eq("id", gid);
  }

  // ── Step 2: Load existing exercises ──
  console.log("\n── Loading existing exercises... ──");
  const { data: existingExercises, error: exErr } = await supabase
    .from("exercises")
    .select("id, name")
    .eq("owner_id", ownerId);
  if (exErr) throw new Error(`Failed to load exercises: ${exErr.message}`);

  const exerciseNameToId = new Map();
  for (const ex of existingExercises || []) {
    exerciseNameToId.set(ex.name.toLowerCase(), ex.id);
  }
  console.log(`  Found ${exerciseNameToId.size} existing exercises`);

  // ── Step 3: Create "Imported" group ──
  const { data: newGroup, error: grpErr } = await supabase
    .from("exercise_groups")
    .insert({
      owner_id: ownerId,
      name: "Imported",
      input_type: "strength",
      is_archived: true,
      sort_order: 9999,
    })
    .select("id")
    .single();
  if (grpErr) throw new Error(`Failed to create Imported group: ${grpErr.message}`);
  const importedGroupId = newGroup.id;
  console.log(`  Created "Imported" group: ${importedGroupId}`);

  // ── Step 4: Parse main log ──
  console.log("\n── Parsing main log... ──");
  const logCsv = fs.readFileSync(
    "C:/Users/merri/Downloads/LogForExport20260215.csv",
    "utf-8"
  );
  const logRows = parseCsv(logCsv);
  console.log(`  Parsed ${logRows.length} rows`);

  // Group rows by date
  const workoutsByDate = new Map();
  for (const row of logRows) {
    const date = parseDate(row.Date);
    if (!date) continue;
    if (!row.Lift) continue;
    if (!workoutsByDate.has(date)) workoutsByDate.set(date, []);
    workoutsByDate.get(date).push(row);
  }
  console.log(`  Found ${workoutsByDate.size} workout dates`);

  // ── Step 5: Create missing exercises (batch) ──
  console.log("\n── Creating missing exercises... ──");
  const allLiftNames = new Set();
  for (const rows of workoutsByDate.values()) {
    for (const row of rows) {
      if (row.Lift) allLiftNames.add(row.Lift);
    }
  }

  const missingExercises = [];
  const { data: maxSortData } = await supabase
    .from("exercises")
    .select("sort_order")
    .eq("owner_id", ownerId)
    .order("sort_order", { ascending: false })
    .limit(1);
  let nextSort = (maxSortData?.[0]?.sort_order ?? -1) + 1;

  for (const liftName of allLiftNames) {
    if (exerciseNameToId.has(liftName.toLowerCase())) continue;

    const id = uuid();
    missingExercises.push({
      id,
      owner_id: ownerId,
      name: liftName,
      exercise_type: "weighted",
      measure_type: "srw",
      counts_toward_volume: true,
      group_ids: [importedGroupId],
      is_archived: true,
      sort_order: nextSort++,
    });
    exerciseNameToId.set(liftName.toLowerCase(), id);
  }

  if (missingExercises.length) {
    const inserted = await batchInsert("exercises", missingExercises);
    console.log(`  Created ${inserted} new exercises (archived, in "Imported" group)`);
  }
  console.log(`  ${allLiftNames.size - missingExercises.length} already existed`);

  // ── Step 6: Build all workout data in memory ──
  console.log("\n── Building workout data... ──");

  const allWorkouts = [];
  const allWorkoutExercises = [];
  const allWorkoutSets = [];

  const sortedDates = [...workoutsByDate.keys()].sort();

  for (const date of sortedDates) {
    const rows = workoutsByDate.get(date);

    // Extract workout-level data
    let location = "";
    let notes = "";
    for (const row of rows) {
      if (row.Location && !location) location = row.Location;
      if (row.Notes && !notes) notes = row.Notes;
    }

    const workoutId = uuid();
    allWorkouts.push({
      id: workoutId,
      owner_id: ownerId,
      date,
      location: location || null,
      notes: notes || null,
    });

    let exerciseOrder = 0;
    for (const row of rows) {
      const liftName = row.Lift;
      if (!liftName) continue;

      const exerciseId = exerciseNameToId.get(liftName.toLowerCase()) || null;

      // Parse superset group
      let supersetGroup = null;
      const ssVal = (row.SuperSets || "").trim();
      if (ssVal && ssVal.startsWith("SS")) {
        supersetGroup = parseInt(ssVal.replace("SS", ""), 10);
        if (isNaN(supersetGroup)) supersetGroup = null;
      }

      const wxeId = uuid();
      allWorkoutExercises.push({
        id: wxeId,
        workout_id: workoutId,
        exercise_id: exerciseId,
        exercise_name_display: liftName,
        exercise_order: exerciseOrder++,
        superset_group: supersetGroup,
      });

      // Create sets (up to 5)
      let setNumber = 0;
      for (let s = 1; s <= 5; s++) {
        const repsStr = row[`Reps${s}`];
        const weightStr = row[`Weight${s}`];
        if (!repsStr && !weightStr) continue;

        const reps = repsStr ? Math.round(parseFloat(repsStr)) : null;
        const weight = weightStr ? parseFloat(weightStr) : null;
        if ((reps === null || reps === 0 || isNaN(reps)) && weight === null) continue;

        setNumber++;
        allWorkoutSets.push({
          id: uuid(),
          workout_id: workoutId,
          workout_exercise_id: wxeId,
          exercise_id: exerciseId,
          exercise_name_display: liftName,
          set_order: setNumber - 1,
          set_number: setNumber,
          set_type: "working",
          reps: reps && !isNaN(reps) ? reps : null,
          weight: weight && !isNaN(weight) ? weight : null,
        });
      }
    }
  }

  console.log(`  Prepared: ${allWorkouts.length} workouts, ${allWorkoutExercises.length} exercises, ${allWorkoutSets.length} sets`);

  // ── Step 7: Batch insert lifting data ──
  console.log("\n── Inserting workouts... ──");
  const wInserted = await batchInsert("workouts", allWorkouts);
  console.log(`  Inserted ${wInserted} workouts`);

  console.log("── Inserting workout exercises... ──");
  const wxeInserted = await batchInsert("workout_exercises", allWorkoutExercises);
  console.log(`  Inserted ${wxeInserted} workout exercises`);

  console.log("── Inserting workout sets... ──");
  const sInserted = await batchInsert("workout_sets", allWorkoutSets);
  console.log(`  Inserted ${sInserted} workout sets`);

  // ── Step 8: Import Tennis ──
  console.log("\n── Importing Tennis... ──");
  const tennisCsv = fs.readFileSync(
    "C:/Users/merri/Downloads/TennisForExport20260215.csv",
    "utf-8"
  );
  const tennisRows = parseCsv(tennisCsv);

  const tennisWorkouts = [];
  const tennisActivities = [];

  for (const row of tennisRows) {
    const date = parseDate(row.Date);
    if (!date) continue;
    const wId = uuid();
    tennisWorkouts.push({
      id: wId,
      owner_id: ownerId,
      date,
      notes: row.Notes || null,
    });
    tennisActivities.push({
      id: uuid(),
      workout_id: wId,
      activity_type: "Tennis",
    });
  }

  const twInserted = await batchInsert("workouts", tennisWorkouts);
  const taInserted = await batchInsert("activity_sessions", tennisActivities);
  console.log(`  Inserted ${twInserted} tennis workouts, ${taInserted} activity sessions`);

  // ── Step 9: Import Racquetball ──
  console.log("\n── Importing Racquetball... ──");
  const rqCsv = fs.readFileSync(
    "C:/Users/merri/Downloads/RacquetballForExport20260215.csv",
    "utf-8"
  );
  const rqRows = parseCsv(rqCsv);

  const rqWorkouts = [];
  const rqActivities = [];

  for (const row of rqRows) {
    const date = parseDate(row.Date);
    if (!date) continue;
    const wId = uuid();
    rqWorkouts.push({
      id: wId,
      owner_id: ownerId,
      date,
    });
    rqActivities.push({
      id: uuid(),
      workout_id: wId,
      activity_type: "Racquetball",
    });
  }

  const rwInserted = await batchInsert("workouts", rqWorkouts);
  const raInserted = await batchInsert("activity_sessions", rqActivities);
  console.log(`  Inserted ${rwInserted} racquetball workouts, ${raInserted} activity sessions`);

  // ── Step 10: Import Other Activities ──
  console.log("\n── Importing Other Activities... ──");
  const otherCsv = fs.readFileSync(
    "C:/Users/merri/Downloads/OtherActivitiesForExport20260215.csv",
    "utf-8"
  );
  const otherRows = parseCsv(otherCsv);

  const otherWorkouts = [];
  const otherActivities = [];

  for (const row of otherRows) {
    const date = parseDate(row.Date);
    if (!date) continue;
    const activity = row["Other Activities"] || "";
    if (!activity) continue;
    const wId = uuid();
    otherWorkouts.push({
      id: wId,
      owner_id: ownerId,
      date,
    });
    otherActivities.push({
      id: uuid(),
      workout_id: wId,
      activity_type: activity,
    });
  }

  const owInserted = await batchInsert("workouts", otherWorkouts);
  const oaInserted = await batchInsert("activity_sessions", otherActivities);
  console.log(`  Inserted ${owInserted} other workouts, ${oaInserted} activity sessions`);

  // ── Summary ──
  console.log("\n══════════════════════════════════════════");
  console.log("  Import complete!");
  console.log(`  Lifting workouts:     ${wInserted}`);
  console.log(`  Exercise entries:     ${wxeInserted}`);
  console.log(`  Sets:                 ${sInserted}`);
  console.log(`  Tennis sessions:      ${taInserted}`);
  console.log(`  Racquetball sessions: ${raInserted}`);
  console.log(`  Other activities:     ${oaInserted}`);
  console.log(`  New exercises created: ${missingExercises.length}`);
  console.log("══════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
