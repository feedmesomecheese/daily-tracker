import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

type SessionRow = {
  id: string;
  workout_id: string;
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
  workouts: {
    date: string;
    workout_type_id: string | null;
    duration_minutes: number | null;
  };
};

type SetRow = {
  workout_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  is_pr: boolean;
  is_cycle_max: boolean;
  is_missed: boolean;
};

// GET /api/workouts/exercises/[id]/stats
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get the exercise definition
  const { data: exercise, error: exError } = await supabase
    .from("exercises")
    .select("id, name, exercise_type, group_ids")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (exError || !exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  // Get the exercise's input type from its groups
  const { data: groupRows } = await supabase
    .from("exercise_groups")
    .select("id, input_type")
    .in("id", exercise.group_ids || []);

  let inputType = "strength";
  for (const g of groupRows || []) {
    if (g.input_type && g.input_type !== "strength") {
      inputType = g.input_type;
      break;
    }
  }

  // Fetch all workout_exercises for this exercise, joined with workout date
  const { data: sessions } = await supabase
    .from("workout_exercises")
    .select(`
      id,
      workout_id,
      exercise_order,
      superset_group,
      duration_minutes,
      distance_miles,
      incline_pct,
      weight,
      time_on_seconds,
      time_off_seconds,
      cycles,
      notes,
      workouts!inner(date, workout_type_id, duration_minutes)
    `)
    .eq("exercise_id", id)
    .eq("workouts.owner_id", user.id)
    .order("workouts(date)", { ascending: true });

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({
      exercise: { ...exercise, inputType },
      frequency: { last30d: 0, last60d: 0, perWeek30d: 0, total: 0 },
      lastSession: null,
      pr: null,
      cycleMax: null,
      tonnageTrend: "flat",
      sessions: [],
      dayOfWeek: {},
      setPatterns: [],
    });
  }

  // Fetch all sets for these workout_exercises
  const weIds = sessions.map((s: SessionRow) => s.id);
  const { data: allSets } = await supabase
    .from("workout_sets")
    .select("workout_exercise_id, set_number, reps, weight, is_pr, is_cycle_max, is_missed")
    .in("workout_exercise_id", weIds)
    .order("set_number", { ascending: true });

  // Group sets by workout_exercise_id
  const setsByWe = new Map<string, SetRow[]>();
  for (const s of (allSets || []) as SetRow[]) {
    const existing = setsByWe.get(s.workout_exercise_id) || [];
    existing.push(s);
    setsByWe.set(s.workout_exercise_id, existing);
  }

  // Build session data
  const now = new Date();
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const d60 = new Date(now);
  d60.setDate(d60.getDate() - 60);
  const d30Str = d30.toISOString().slice(0, 10);
  const d60Str = d60.toISOString().slice(0, 10);

  let count30d = 0;
  let count60d = 0;
  const dayOfWeek: Record<string, number> = {
    Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0,
  };
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let prWeight: { weight: number; reps: number; date: string } | null = null;
  let cycleMaxRecord: { weight: number; date: string } | null = null;
  const setPatternCounts = new Map<string, number>();

  const sessionData: {
    date: string;
    workout_type_id: string | null;
    tonnage: number;
    topWeight: number;
    topReps: number;
    sets: SetRow[];
    duration_minutes: number | null;
    distance_miles: number | null;
    incline_pct: number | null;
    time_on_seconds: number | null;
    time_off_seconds: number | null;
    cycles: number | null;
    notes: string | null;
    intensity: number | null;
  }[] = [];

  for (const session of sessions as SessionRow[]) {
    const workout = session.workouts;
    const date = workout.date;
    const sets = setsByWe.get(session.id) || [];

    // Frequency
    if (date >= d30Str) count30d++;
    if (date >= d60Str) count60d++;

    // Day of week
    const dow = new Date(date + "T12:00:00").getDay();
    dayOfWeek[dayNames[dow]]++;

    // Compute tonnage, top set
    let tonnage = 0;
    let topWeight = 0;
    let topReps = 0;

    for (const s of sets) {
      const w = s.weight || 0;
      const r = s.reps || 0;
      tonnage += w * r;

      if (w > topWeight || (w === topWeight && r > topReps)) {
        topWeight = w;
        topReps = r;
      }

      // PR tracking
      if (s.is_pr && w > 0) {
        if (!prWeight || w > prWeight.weight) {
          prWeight = { weight: w, reps: r, date };
        }
      }

      // Cycle max tracking
      if (s.is_cycle_max && w > 0) {
        if (!cycleMaxRecord || w > cycleMaxRecord.weight) {
          cycleMaxRecord = { weight: w, date };
        }
      }
    }

    // Set pattern (e.g. "3x5", "5x5")
    if (sets.length > 0) {
      const repCounts = sets.map((s) => s.reps || 0);
      const pattern = `${sets.length}x${repCounts[0]}`;
      setPatternCounts.set(pattern, (setPatternCounts.get(pattern) || 0) + 1);
    }

    // Intensity (top set weight / cycle max weight)
    let intensity: number | null = null;
    if (cycleMaxRecord && topWeight > 0) {
      intensity = Math.round((topWeight / cycleMaxRecord.weight) * 100);
    }

    sessionData.push({
      date,
      workout_type_id: workout.workout_type_id,
      tonnage,
      topWeight,
      topReps,
      sets,
      duration_minutes: session.duration_minutes,
      distance_miles: session.distance_miles,
      incline_pct: session.incline_pct,
      time_on_seconds: session.time_on_seconds,
      time_off_seconds: session.time_off_seconds,
      cycles: session.cycles,
      notes: session.notes,
      intensity,
    });
  }

  // Recalculate intensity for all sessions now that we have the final cycle max
  if (cycleMaxRecord) {
    for (const s of sessionData) {
      if (s.topWeight > 0) {
        s.intensity = Math.round((s.topWeight / cycleMaxRecord.weight) * 100);
      }
    }
  }

  // Tonnage trend (compare last 4 sessions avg vs previous 4)
  let tonnageTrend: "up" | "down" | "flat" = "flat";
  if (sessionData.length >= 4) {
    const recent = sessionData.slice(-4);
    const previous = sessionData.slice(-8, -4);
    if (previous.length >= 2) {
      const recentAvg = recent.reduce((a, b) => a + b.tonnage, 0) / recent.length;
      const prevAvg = previous.reduce((a, b) => a + b.tonnage, 0) / previous.length;
      if (recentAvg > prevAvg * 1.05) tonnageTrend = "up";
      else if (recentAvg < prevAvg * 0.95) tonnageTrend = "down";
    }
  }

  // Cardio PRs
  let distancePr: { distance: number; date: string } | null = null;
  let pacePr: { pace: number; distance: number; duration: number; date: string } | null = null;
  if (inputType === "cardio") {
    for (const s of sessionData) {
      if (s.distance_miles && s.distance_miles > 0) {
        if (!distancePr || s.distance_miles > distancePr.distance) {
          distancePr = { distance: s.distance_miles, date: s.date };
        }
        if (s.duration_minutes && s.duration_minutes > 0) {
          const pace = s.duration_minutes / s.distance_miles;
          if (!pacePr || pace < pacePr.pace) {
            pacePr = { pace, distance: s.distance_miles, duration: s.duration_minutes, date: s.date };
          }
        }
      }
    }
  }

  // Frequency calculations
  const weeks30d = 30 / 7;
  const perWeek30d = Math.round((count30d / weeks30d) * 10) / 10;

  // Last session
  const lastSessionData = sessionData[sessionData.length - 1];
  const lastSession = lastSessionData
    ? {
        date: lastSessionData.date,
        sets: lastSessionData.sets,
        tonnage: lastSessionData.tonnage,
        topWeight: lastSessionData.topWeight,
        topReps: lastSessionData.topReps,
        duration_minutes: lastSessionData.duration_minutes,
        distance_miles: lastSessionData.distance_miles,
        incline_pct: lastSessionData.incline_pct,
        time_on_seconds: lastSessionData.time_on_seconds,
        time_off_seconds: lastSessionData.time_off_seconds,
        cycles: lastSessionData.cycles,
        notes: lastSessionData.notes,
      }
    : null;

  // Set patterns sorted by count
  const setPatterns = Array.from(setPatternCounts.entries())
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return NextResponse.json({
    exercise: { ...exercise, inputType },
    frequency: {
      last30d: count30d,
      last60d: count60d,
      perWeek30d,
      total: sessions.length,
    },
    lastSession,
    pr: prWeight,
    cycleMax: cycleMaxRecord,
    cardioPr: inputType === "cardio" ? { distance: distancePr, pace: pacePr } : undefined,
    tonnageTrend,
    sessions: sessionData.map((s) => ({
      date: s.date,
      workout_type_id: s.workout_type_id,
      tonnage: s.tonnage,
      topWeight: s.topWeight,
      topReps: s.topReps,
      duration_minutes: s.duration_minutes,
      distance_miles: s.distance_miles,
      intensity: s.intensity,
    })),
    dayOfWeek,
    setPatterns,
  });
}
