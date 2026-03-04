/**
 * One-off script to:
 * 1. Delete blank workouts (no exercises, no activity sessions)
 * 2. Assign workout_type_id based on exercises present
 *
 * Usage: node scripts/fix-workout-types.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const OWNER_ID = "f4fefe91-cb8d-4ae5-8a67-b59dead2572e";

const TYPES = {
  BENCH: "c7bcff47-5047-480a-9734-9088484e7eaa",
  SQUAT: "50a0e566-d768-490a-a9af-951e3ebb6080",
  DEADLIFT: "84a09947-47b7-4d6b-a9eb-320547303959",
  CARDIO: "2ea65f3b-2f09-418e-b9e1-e5a5b5e11d04",
  OTHER: "7102a3d7-a10a-46e9-8d84-a8215fe0bdd4",
};

/** Paginated fetch helper */
async function fetchAll(table, select, filters = {}) {
  const rows = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    let query = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [key, val] of Object.entries(filters)) {
      query = query.eq(key, val);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Fetch ${table} failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

function classifyWorkout(exerciseNames) {
  const lower = exerciseNames.map((n) => n.toLowerCase());

  const hasBench = lower.some((n) => n.includes("bench press"));
  const hasSquat = lower.some(
    (n) => n.includes("squat") && !n.includes("sissy")
  );
  const hasDeadlift = lower.some(
    (n) => n.includes("deadlift") || n.includes("rack pull")
  );

  if (hasDeadlift) return TYPES.DEADLIFT;
  if (hasSquat) return TYPES.SQUAT;
  if (hasBench) return TYPES.BENCH;
  return TYPES.OTHER;
}

async function main() {
  // ── Step 1: Delete blank workouts ──
  console.log("── Finding blank workouts... ──");

  const allWorkouts = await fetchAll("workouts", "id, date", {
    owner_id: OWNER_ID,
  });
  console.log(`  Total workouts: ${allWorkouts.length}`);

  // Get ALL workout_exercises (paginated)
  const allExerciseEntries = await fetchAll("workout_exercises", "workout_id");
  const exerciseWorkoutIds = new Set(allExerciseEntries.map((e) => e.workout_id));
  console.log(`  Workouts with exercises: ${exerciseWorkoutIds.size}`);

  // Get ALL activity_sessions (paginated)
  const allActivities = await fetchAll("activity_sessions", "workout_id");
  const activityWorkoutIds = new Set(allActivities.map((a) => a.workout_id));
  console.log(`  Workouts with activities: ${activityWorkoutIds.size}`);

  const blankIds = allWorkouts
    .filter(
      (w) => !exerciseWorkoutIds.has(w.id) && !activityWorkoutIds.has(w.id)
    )
    .map((w) => w.id);

  console.log(`  Blank workouts to delete: ${blankIds.length}`);

  if (blankIds.length > 0) {
    for (let i = 0; i < blankIds.length; i += 500) {
      const chunk = blankIds.slice(i, i + 500);
      const { error } = await sb.from("workouts").delete().in("id", chunk);
      if (error) console.error("  Delete error:", error.message);
    }
    console.log(`  Deleted ${blankIds.length} blank workouts`);
  }

  // ── Step 2: Assign workout types ──
  console.log("\n── Assigning workout types... ──");

  // Build exercise names by workout (already fetched above, but need names)
  const allExNamed = await fetchAll(
    "workout_exercises",
    "workout_id, exercise_name_display"
  );
  const exercisesByWorkout = new Map();
  for (const row of allExNamed) {
    const existing = exercisesByWorkout.get(row.workout_id) || [];
    existing.push(row.exercise_name_display);
    exercisesByWorkout.set(row.workout_id, existing);
  }
  console.log(`  Lifting workouts to classify: ${exercisesByWorkout.size}`);

  const updates = new Map();
  for (const [workoutId, names] of exercisesByWorkout) {
    const typeId = classifyWorkout(names);
    const existing = updates.get(typeId) || [];
    existing.push(workoutId);
    updates.set(typeId, existing);
  }

  // Activity-only workouts get "Other Exercise" type
  const activityOnlyIds = [...activityWorkoutIds].filter(
    (id) => !exercisesByWorkout.has(id)
  );
  if (activityOnlyIds.length > 0) {
    const existing = updates.get(TYPES.OTHER) || [];
    existing.push(...activityOnlyIds);
    updates.set(TYPES.OTHER, existing);
  }

  for (const [typeId, ids] of updates) {
    const typeName = Object.entries(TYPES).find(([, v]) => v === typeId)?.[0];
    console.log(`  ${typeName}: ${ids.length} workouts`);

    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { error } = await sb
        .from("workouts")
        .update({ workout_type_id: typeId })
        .in("id", chunk);
      if (error) console.error(`  Update error for ${typeName}:`, error.message);
    }
  }

  console.log("\n  Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
