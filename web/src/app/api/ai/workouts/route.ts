import { NextResponse } from "next/server";
import { validateAiKey, getAiSupabase, getAiOwnerId, AI_CORS_HEADERS, handleAiOptions } from "@/lib/aiAuth";

export async function OPTIONS() { return handleAiOptions(); }

export async function GET(req: Request) {
  const authError = validateAiKey(req);
  if (authError) return authError;

  const supabase = getAiSupabase();
  const ownerId = getAiOwnerId();

  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get("days") || "60"), 365);
  const end = url.searchParams.get("end") || new Date().toISOString().slice(0, 10);
  const startDate = new Date(end);
  startDate.setDate(startDate.getDate() - days + 1);
  const start = startDate.toISOString().slice(0, 10);

  const { data: workouts, error: workoutsError } = await supabase
    .from("workouts")
    .select("id, date, workout_type, duration_minutes, rating, notes, body_weight, body_fat_pct")
    .eq("owner_id", ownerId)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false });

  if (workoutsError) {
    return NextResponse.json({ error: workoutsError.message }, { status: 500 });
  }

  if (!workouts || workouts.length === 0) {
    return NextResponse.json({ period: { start, end, days }, workouts: [] }, { headers: AI_CORS_HEADERS });
  }

  const workoutIds = workouts.map((w) => w.id);

  // Fetch exercises for these workouts (chunked to avoid URL length limits)
  const CHUNK = 200;
  const allExercises: { workout_id: string; exercise_name_display: string; exercise_order: number; notes: string | null }[] = [];
  for (let i = 0; i < workoutIds.length; i += CHUNK) {
    const chunk = workoutIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("workout_exercises")
      .select("workout_id, exercise_name_display, exercise_order, notes")
      .in("workout_id", chunk)
      .order("exercise_order", { ascending: true });
    if (data) allExercises.push(...data);
  }

  const exercisesByWorkout = new Map<string, string[]>();
  for (const ex of allExercises) {
    if (!exercisesByWorkout.has(ex.workout_id)) exercisesByWorkout.set(ex.workout_id, []);
    exercisesByWorkout.get(ex.workout_id)!.push(ex.exercise_name_display);
  }

  const result = workouts.map((w) => ({
    date: w.date,
    type: w.workout_type,
    duration_minutes: w.duration_minutes,
    rating: w.rating,
    notes: w.notes,
    body_weight: w.body_weight,
    body_fat_pct: w.body_fat_pct,
    exercises: exercisesByWorkout.get(w.id) || [],
  }));

  return NextResponse.json({ period: { start, end, days }, workouts: result }, { headers: AI_CORS_HEADERS });
}
