import { NextResponse } from "next/server";
import { validateAiRequest, getAiSupabase, AI_CORS_HEADERS, handleAiOptions } from "@/lib/aiAuth";

export async function OPTIONS() { return handleAiOptions(); }

export async function GET(req: Request) {
  const auth = await validateAiRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { ownerId } = auth;

  const supabase = getAiSupabase();

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const end = url.searchParams.get("end") || today;
  let start = url.searchParams.get("start") || "";
  if (!start) {
    const days = Math.min(parseInt(url.searchParams.get("days") || "60"), 3650);
    const startDate = new Date(end);
    startDate.setDate(startDate.getDate() - days + 1);
    start = startDate.toISOString().slice(0, 10);
  }

  const { data: workouts, error: workoutsError } = await supabase
    .from("workouts")
    .select("id, date, workout_type, duration_minutes, rating, notes, body_weight, body_fat_pct")
    .eq("owner_id", ownerId)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false });

  if (workoutsError) return NextResponse.json({ error: workoutsError.message }, { status: 500 });
  if (!workouts || workouts.length === 0) {
    return NextResponse.json({ period: { start, end }, workouts: [] }, { headers: AI_CORS_HEADERS });
  }

  const workoutIds = workouts.map((w) => w.id);
  const CHUNK = 200;

  // Fetch exercises
  type ExRow = { id: string; workout_id: string; exercise_name_display: string; exercise_order: number; notes: string | null };
  const allExercises: ExRow[] = [];
  for (let i = 0; i < workoutIds.length; i += CHUNK) {
    const chunk = workoutIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("workout_exercises")
      .select("id, workout_id, exercise_name_display, exercise_order, notes")
      .in("workout_id", chunk)
      .order("exercise_order", { ascending: true });
    if (data) allExercises.push(...(data as ExRow[]));
  }

  const exerciseIds = allExercises.map((e) => e.id);

  // Fetch sets
  type SetRow = { workout_exercise_id: string; set_number: number; reps: number | null; weight: number | null; is_missed: boolean; set_type: string };
  const allSets: SetRow[] = [];
  for (let i = 0; i < exerciseIds.length; i += CHUNK) {
    const chunk = exerciseIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("workout_sets")
      .select("workout_exercise_id, set_number, reps, weight, is_missed, set_type")
      .in("workout_exercise_id", chunk)
      .order("set_number", { ascending: true });
    if (data) allSets.push(...(data as SetRow[]));
  }

  // Group sets by exercise id
  const setsByExercise = new Map<string, SetRow[]>();
  for (const s of allSets) {
    if (!setsByExercise.has(s.workout_exercise_id)) setsByExercise.set(s.workout_exercise_id, []);
    setsByExercise.get(s.workout_exercise_id)!.push(s);
  }

  // Group exercises by workout id
  const exercisesByWorkout = new Map<string, ExRow[]>();
  for (const ex of allExercises) {
    if (!exercisesByWorkout.has(ex.workout_id)) exercisesByWorkout.set(ex.workout_id, []);
    exercisesByWorkout.get(ex.workout_id)!.push(ex);
  }

  const result = workouts.map((w) => {
    const exercises = (exercisesByWorkout.get(w.id) || []).map((ex) => {
      const sets = (setsByExercise.get(ex.id) || [])
        .filter((s) => !s.is_missed && s.reps !== null && s.weight !== null)
        .map((s) => ({ reps: s.reps!, weight: s.weight! }));
      const tonnage = Math.round(sets.reduce((sum, s) => sum + s.reps * s.weight, 0));
      return {
        name: ex.exercise_name_display,
        notes: ex.notes || undefined,
        sets,
        tonnage_lbs: tonnage,
      };
    });

    const workoutTonnage = exercises.reduce((sum, ex) => sum + ex.tonnage_lbs, 0);

    return {
      date: w.date,
      type: w.workout_type,
      duration_minutes: w.duration_minutes,
      rating: w.rating,
      notes: w.notes,
      body_weight: w.body_weight,
      body_fat_pct: w.body_fat_pct,
      total_tonnage_lbs: workoutTonnage,
      exercises,
    };
  });

  return NextResponse.json({ period: { start, end }, workouts: result }, { headers: AI_CORS_HEADERS });
}
