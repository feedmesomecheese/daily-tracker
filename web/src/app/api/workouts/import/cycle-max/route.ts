import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

// POST /api/workouts/import/cycle-max
// Body: { csv: string }
// CSV format: Lift,Weight4,Date (or Lift,Weight,Date)
// Date format: M/D/YYYY
export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const csv = body.csv as string;

  if (!csv || !csv.trim()) {
    return NextResponse.json({ error: "No CSV data provided" }, { status: 400 });
  }

  // Parse CSV rows
  const lines = csv.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have a header and at least one row" }, { status: 400 });
  }

  // Skip header
  const rows: { lift: string; weight: number; date: string }[] = [];
  const parseErrors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Handle quoted fields with commas
    const parts = parseCSVLine(line);
    if (parts.length < 3) {
      parseErrors.push(`Row ${i + 1}: not enough columns: "${line}"`);
      continue;
    }

    const lift = parts[0].trim();
    const weightStr = parts[1].trim();
    const dateStr = parts[2].trim().replace(/[\r\n\s]+/g, ""); // clean whitespace

    const weight = parseFloat(weightStr);
    if (isNaN(weight) || weight <= 0) {
      parseErrors.push(`Row ${i + 1}: invalid weight "${weightStr}"`);
      continue;
    }

    // Parse M/D/YYYY to YYYY-MM-DD
    const dateParts = dateStr.split("/");
    if (dateParts.length !== 3) {
      parseErrors.push(`Row ${i + 1}: invalid date "${dateStr}"`);
      continue;
    }
    const [month, day, year] = dateParts;
    const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

    // Validate date
    const d = new Date(isoDate + "T12:00:00");
    if (isNaN(d.getTime())) {
      parseErrors.push(`Row ${i + 1}: invalid date "${dateStr}"`);
      continue;
    }

    rows.push({ lift, weight, date: isoDate });
  }

  // Fetch all exercises for this user
  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, name, aliases")
    .eq("owner_id", user.id);

  if (!exercises) {
    return NextResponse.json({ error: "Failed to fetch exercises" }, { status: 500 });
  }

  // Build name → exercise_id map (case-insensitive, include aliases)
  const nameToExercise = new Map<string, { id: string; name: string }>();
  for (const ex of exercises) {
    nameToExercise.set(ex.name.toLowerCase(), { id: ex.id, name: ex.name });
    for (const alias of ex.aliases || []) {
      nameToExercise.set(alias.toLowerCase(), { id: ex.id, name: ex.name });
    }
  }

  // Group rows by exercise
  const matched: { exerciseId: string; exerciseName: string; weight: number; date: string }[] = [];
  const unmatchedExercises = new Set<string>();

  for (const row of rows) {
    const ex = nameToExercise.get(row.lift.toLowerCase());
    if (!ex) {
      unmatchedExercises.add(row.lift);
      continue;
    }
    matched.push({ exerciseId: ex.id, exerciseName: ex.name, weight: row.weight, date: row.date });
  }

  // For each matched row, find the workout_exercise + workout_set and mark is_cycle_max
  let setsUpdated = 0;
  let setsNotFound = 0;
  const notFoundDetails: string[] = [];

  // Process in batches by exercise to reduce queries
  const byExercise = new Map<string, typeof matched>();
  for (const m of matched) {
    const list = byExercise.get(m.exerciseId) || [];
    list.push(m);
    byExercise.set(m.exerciseId, list);
  }

  for (const [exerciseId, entries] of byExercise) {
    // Get all workout_exercises for this exercise
    const dates = [...new Set(entries.map((e) => e.date))];

    // Find workouts on these dates
    const { data: workouts } = await supabase
      .from("workouts")
      .select("id, date")
      .eq("owner_id", user.id)
      .in("date", dates);

    if (!workouts || workouts.length === 0) {
      for (const e of entries) {
        setsNotFound++;
        notFoundDetails.push(`${e.exerciseName} ${e.weight}lbs on ${e.date}: no workout found`);
      }
      continue;
    }

    type WorkoutRow = { id: string; date: string };
    const workoutDateMap = new Map<string, string[]>();
    for (const w of workouts as WorkoutRow[]) {
      const list = workoutDateMap.get(w.date) || [];
      list.push(w.id);
      workoutDateMap.set(w.date, list);
    }

    // Find workout_exercises for this exercise in these workouts
    const workoutIds = (workouts as WorkoutRow[]).map((w) => w.id);
    const { data: workoutExercises } = await supabase
      .from("workout_exercises")
      .select("id, workout_id")
      .eq("exercise_id", exerciseId)
      .in("workout_id", workoutIds);

    if (!workoutExercises || workoutExercises.length === 0) {
      for (const e of entries) {
        setsNotFound++;
        notFoundDetails.push(`${e.exerciseName} ${e.weight}lbs on ${e.date}: exercise not in workout`);
      }
      continue;
    }

    // Build workout_id → workout_exercise_ids
    const weByWorkout = new Map<string, string[]>();
    for (const we of workoutExercises) {
      const list = weByWorkout.get(we.workout_id) || [];
      list.push(we.id);
      weByWorkout.set(we.workout_id, list);
    }

    // For each entry, find the set with matching weight
    for (const entry of entries) {
      const wIds = workoutDateMap.get(entry.date);
      if (!wIds) {
        setsNotFound++;
        notFoundDetails.push(`${entry.exerciseName} ${entry.weight}lbs on ${entry.date}: no workout on date`);
        continue;
      }

      let found = false;
      for (const wId of wIds) {
        const weIds = weByWorkout.get(wId);
        if (!weIds) continue;

        // Find sets with matching weight
        const { data: matchingSets } = await supabase
          .from("workout_sets")
          .select("id, weight, is_cycle_max")
          .in("workout_exercise_id", weIds)
          .eq("weight", entry.weight)
          .limit(1);

        if (matchingSets && matchingSets.length > 0) {
          // Update the set
          if (!matchingSets[0].is_cycle_max) {
            await supabase
              .from("workout_sets")
              .update({ is_cycle_max: true })
              .eq("id", matchingSets[0].id);
          }
          setsUpdated++;
          found = true;
          break;
        }
      }

      if (!found) {
        setsNotFound++;
        notFoundDetails.push(`${entry.exerciseName} ${entry.weight}lbs on ${entry.date}: no matching set`);
      }
    }
  }

  return NextResponse.json({
    summary: {
      totalRows: rows.length,
      parseErrors: parseErrors.length,
      exercisesMatched: byExercise.size,
      unmatchedExercises: [...unmatchedExercises],
      setsUpdated,
      setsNotFound,
    },
    parseErrors: parseErrors.slice(0, 20),
    notFoundDetails: notFoundDetails.slice(0, 50),
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
