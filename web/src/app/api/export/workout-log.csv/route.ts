import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

function csvEscape(v: string) {
  if (v == null) return "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const url = new URL(req.url);

  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const isISODate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if ((start && !isISODate(start)) || (end && !isISODate(end))) {
    return NextResponse.json({ error: "Invalid start/end. Use YYYY-MM-DD." }, { status: 400 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch workout types for display names
  const { data: types } = await supabase
    .from("workout_types")
    .select("id, name")
    .eq("owner_id", user.id);
  const typeMap = new Map<string, string>();
  for (const t of types || []) typeMap.set(t.id, t.name);

  // Fetch modifiers for display names
  const { data: modifiers } = await supabase
    .from("exercise_modifiers")
    .select("id, name")
    .eq("owner_id", user.id);
  const modMap = new Map<string, string>();
  for (const m of modifiers || []) modMap.set(m.id, m.name);

  // Fetch workouts with pagination
  type WorkoutRow = {
    id: string;
    date: string;
    workout_type_id: string | null;
    duration_minutes: number | null;
    rating: number | null;
    notes: string | null;
  };

  const allWorkouts: WorkoutRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    let q = supabase
      .from("workouts")
      .select("id, date, workout_type_id, duration_minutes, rating, notes")
      .eq("owner_id", user.id)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (start) q = q.gte("date", start);
    if (end) q = q.lte("date", end);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const batch = data || [];
    allWorkouts.push(...(batch as WorkoutRow[]));
    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  if (allWorkouts.length === 0) {
    return new Response("No workouts found", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // Fetch all workout_exercises for these workouts
  const workoutIds = allWorkouts.map((w) => w.id);

  type WERow = {
    id: string;
    workout_id: string;
    exercise_name_display: string;
    modifier_ids: string[];
    exercise_order: number;
    superset_group: number | null;
    duration_minutes: number | null;
    distance_miles: number | null;
    incline_pct: number | null;
    weight: number | null;
    time_on_seconds: number | null;
    time_off_seconds: number | null;
    cycles: number | null;
    notes: string | null;
  };

  const allExercises: WERow[] = [];
  const CHUNK = 200;
  for (let i = 0; i < workoutIds.length; i += CHUNK) {
    const chunk = workoutIds.slice(i, i + CHUNK);
    let exOffset = 0;
    while (true) {
      const { data } = await supabase
        .from("workout_exercises")
        .select("id, workout_id, exercise_name_display, modifier_ids, exercise_order, superset_group, duration_minutes, distance_miles, incline_pct, weight, time_on_seconds, time_off_seconds, cycles, notes")
        .in("workout_id", chunk)
        .order("exercise_order", { ascending: true })
        .range(exOffset, exOffset + PAGE - 1);

      if (!data || data.length === 0) break;
      allExercises.push(...(data as WERow[]));
      if (data.length < PAGE) break;
      exOffset += PAGE;
    }
  }

  // Fetch all sets
  const weIds = allExercises.map((e) => e.id);

  type SetRow = {
    workout_exercise_id: string;
    set_number: number;
    reps: number | null;
    weight: number | null;
    is_pr: boolean;
    is_cycle_max: boolean;
    is_missed: boolean;
  };

  const allSets: SetRow[] = [];
  for (let i = 0; i < weIds.length; i += CHUNK) {
    const chunk = weIds.slice(i, i + CHUNK);
    let setOffset = 0;
    while (true) {
      const { data } = await supabase
        .from("workout_sets")
        .select("workout_exercise_id, set_number, reps, weight, is_pr, is_cycle_max, is_missed")
        .in("workout_exercise_id", chunk)
        .order("set_number", { ascending: true })
        .range(setOffset, setOffset + PAGE - 1);

      if (!data || data.length === 0) break;
      allSets.push(...(data as SetRow[]));
      if (data.length < PAGE) break;
      setOffset += PAGE;
    }
  }

  // Fetch activity sessions
  type ActivityRow = {
    workout_id: string;
    activity_type: string;
    duration_minutes: number | null;
    notes: string | null;
  };

  const allActivities: ActivityRow[] = [];
  for (let i = 0; i < workoutIds.length; i += CHUNK) {
    const chunk = workoutIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("activity_sessions")
      .select("workout_id, activity_type, duration_minutes, notes")
      .in("workout_id", chunk);
    if (data) allActivities.push(...(data as ActivityRow[]));
  }

  // Group data
  const exercisesByWorkout = new Map<string, WERow[]>();
  for (const e of allExercises) {
    const list = exercisesByWorkout.get(e.workout_id) || [];
    list.push(e);
    exercisesByWorkout.set(e.workout_id, list);
  }

  const setsByExercise = new Map<string, SetRow[]>();
  for (const s of allSets) {
    const list = setsByExercise.get(s.workout_exercise_id) || [];
    list.push(s);
    setsByExercise.set(s.workout_exercise_id, list);
  }

  const activitiesByWorkout = new Map<string, ActivityRow[]>();
  for (const a of allActivities) {
    const list = activitiesByWorkout.get(a.workout_id) || [];
    list.push(a);
    activitiesByWorkout.set(a.workout_id, list);
  }

  // Build CSV rows — one row per set (or per exercise for cardio/hiit, or per activity)
  const header = [
    "Date", "Workout Type", "Duration (min)", "Rating", "Workout Notes",
    "Exercise", "Modifiers", "Set #", "Reps", "Weight",
    "PR", "Cycle Max", "Missed",
    "Ex Duration (min)", "Distance (mi)", "Incline %", "Ex Weight",
    "Time On (s)", "Time Off (s)", "Cycles", "Exercise Notes",
  ];

  const lines: string[] = [header.map(csvEscape).join(",")];

  for (const w of allWorkouts) {
    const typeName = w.workout_type_id ? (typeMap.get(w.workout_type_id) || "") : "";
    const wCols = [
      w.date,
      typeName,
      w.duration_minutes != null ? String(w.duration_minutes) : "",
      w.rating != null ? String(w.rating) : "",
      w.notes || "",
    ];

    const exercises = exercisesByWorkout.get(w.id) || [];
    const activities = activitiesByWorkout.get(w.id) || [];

    if (exercises.length === 0 && activities.length === 0) {
      // Workout with no exercises — still include as a row
      lines.push([...wCols, ...Array(16).fill("")].map(csvEscape).join(","));
      continue;
    }

    for (const ex of exercises) {
      const modNames = (ex.modifier_ids || [])
        .map((id) => modMap.get(id) || id)
        .join("; ");

      const sets = setsByExercise.get(ex.id) || [];

      const exCols = [
        ex.exercise_name_display,
        modNames,
      ];

      const exTrailingCols = [
        ex.duration_minutes != null ? String(ex.duration_minutes) : "",
        ex.distance_miles != null ? String(ex.distance_miles) : "",
        ex.incline_pct != null ? String(ex.incline_pct) : "",
        ex.weight != null ? String(ex.weight) : "",
        ex.time_on_seconds != null ? String(ex.time_on_seconds) : "",
        ex.time_off_seconds != null ? String(ex.time_off_seconds) : "",
        ex.cycles != null ? String(ex.cycles) : "",
        ex.notes || "",
      ];

      if (sets.length === 0) {
        // Cardio/HIIT/sport — one row per exercise
        lines.push([...wCols, ...exCols, "", "", "", "", "", "", ...exTrailingCols].map(csvEscape).join(","));
      } else {
        for (const s of sets) {
          const setCols = [
            String(s.set_number),
            s.reps != null ? String(s.reps) : "",
            s.weight != null ? String(s.weight) : "",
            s.is_pr ? "Y" : "",
            s.is_cycle_max ? "Y" : "",
            s.is_missed ? "Y" : "",
          ];
          lines.push([...wCols, ...exCols, ...setCols, ...exTrailingCols].map(csvEscape).join(","));
        }
      }
    }

    for (const a of activities) {
      const actCols = [
        a.activity_type,
        "", // modifiers
        "", "", "", "", "", "", // set cols
        a.duration_minutes != null ? String(a.duration_minutes) : "",
        "", "", "", "", "", "", // remaining ex cols
        a.notes || "",
      ];
      lines.push([...wCols, ...actCols].map(csvEscape).join(","));
    }
  }

  const csvText = lines.join("\n");

  return new Response(csvText, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="workout-log${start ? `_${start}` : ""}${end ? `_to_${end}` : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
