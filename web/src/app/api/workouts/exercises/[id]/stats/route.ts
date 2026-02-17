import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

type SessionRow = {
  id: string;
  workout_id: string;
  exercise_id: string | null;
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
    .select("id, name, exercise_type, group_ids, parent_exercise_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (exError || !exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  // Find linked exercise IDs (this exercise + children)
  const exerciseIds: string[] = [id];

  // Check if this exercise has children (it's a parent)
  const { data: children } = await supabase
    .from("exercises")
    .select("id, name, parent_modifier_filter")
    .eq("parent_exercise_id", id)
    .eq("owner_id", user.id);

  // Map child exercise ID → required modifier IDs (null = include all sessions)
  const childModifierFilter = new Map<string, string[] | null>();

  const linkedNames: string[] = [];
  if (children && children.length > 0) {
    for (const child of children) {
      exerciseIds.push(child.id);
      childModifierFilter.set(
        child.id,
        child.parent_modifier_filter?.length ? child.parent_modifier_filter : null
      );
      linkedNames.push(child.name);
    }
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

  // Fetch all workout_exercises for this exercise (and linked exercises), joined with workout date
  // Paginate to avoid Supabase default 1000 row limit
  const allSessions: SessionRow[] = [];
  let sessionOffset = 0;
  const SESSION_PAGE = 1000;
  while (true) {
    const { data: page } = await supabase
      .from("workout_exercises")
      .select(`
        id,
        workout_id,
        exercise_id,
        modifier_ids,
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
      .in("exercise_id", exerciseIds)
      .eq("workouts.owner_id", user.id)
      .order("workouts(date)", { ascending: true })
      .range(sessionOffset, sessionOffset + SESSION_PAGE - 1);

    if (!page || page.length === 0) break;
    allSessions.push(...(page as SessionRow[]));
    if (page.length < SESSION_PAGE) break;
    sessionOffset += SESSION_PAGE;
  }

  // Filter out child exercise sessions that don't match the modifier filter
  const sessions = allSessions.filter((s) => {
    // Sessions for the parent exercise itself — always include
    if (s.exercise_id === id) return true;
    // Sessions for child exercises — check modifier filter
    const filter = s.exercise_id ? childModifierFilter.get(s.exercise_id) : null;
    if (!filter) return true; // no filter = include all
    // At least one required modifier must be present
    return filter.some((modId) => (s.modifier_ids || []).includes(modId));
  });

  if (sessions.length === 0) {
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

  // Fetch all sets for these workout_exercises (chunked to avoid URL length limits)
  const weIds = sessions.map((s: SessionRow) => s.id);
  const allSets: SetRow[] = [];
  const CHUNK = 200;
  for (let i = 0; i < weIds.length; i += CHUNK) {
    const chunk = weIds.slice(i, i + CHUNK);
    let setOffset = 0;
    while (true) {
      const { data: page } = await supabase
        .from("workout_sets")
        .select("workout_exercise_id, set_number, reps, weight, is_pr, is_cycle_max, is_missed")
        .in("workout_exercise_id", chunk)
        .order("set_number", { ascending: true })
        .range(setOffset, setOffset + SESSION_PAGE - 1);

      if (!page || page.length === 0) break;
      allSets.push(...(page as SetRow[]));
      if (page.length < SESSION_PAGE) break;
      setOffset += SESSION_PAGE;
    }
  }

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
  const cycleMaxHistory: { weight: number; date: string }[] = [];
  let oneRepMax: { weight: number; date: string } | null = null;
  let tonnagePr: { tonnage: number; date: string } | null = null;
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
    applicableCycleMax: number | null;
  }[] = [];

  // First pass: collect all cycle max entries and build session data
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

      // Top set tracking — ignore 0-rep sets (missed lifts / bar feel)
      if (r > 0 && (w > topWeight || (w === topWeight && r > topReps))) {
        topWeight = w;
        topReps = r;
      }

      // PR tracking (flagged)
      if (s.is_pr && w > 0) {
        if (!prWeight || w > prWeight.weight) {
          prWeight = { weight: w, reps: r, date };
        }
      }

      // Cycle max tracking (flagged) — collect all, sort later
      if (s.is_cycle_max && w > 0) {
        cycleMaxHistory.push({ weight: w, date });
      }

      // 1RM tracking (heaviest single rep, not missed)
      if (r === 1 && w > 0 && !s.is_missed) {
        if (!oneRepMax || w > oneRepMax.weight) {
          oneRepMax = { weight: w, date };
        }
      }
    }

    // Tonnage PR tracking
    if (tonnage > 0 && (!tonnagePr || tonnage > tonnagePr.tonnage)) {
      tonnagePr = { tonnage, date };
    }

    // Set pattern (e.g. "3x5", "5x5")
    if (sets.length > 0) {
      const repCounts = sets.map((s) => s.reps || 0);
      const pattern = `${sets.length}x${repCounts[0]}`;
      setPatternCounts.set(pattern, (setPatternCounts.get(pattern) || 0) + 1);
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
      intensity: null,
      applicableCycleMax: null,
    });
  }

  // Sort cycle max history by date for lookups
  cycleMaxHistory.sort((a, b) => a.date.localeCompare(b.date));

  // Current cycle max = most recent by date (not highest weight)
  const cycleMaxRecord = cycleMaxHistory.length > 0
    ? cycleMaxHistory[cycleMaxHistory.length - 1]
    : null;

  // Calculate intensity for each session using the most recent cycle max BEFORE that session
  for (const s of sessionData) {
    if (s.topWeight > 0 && cycleMaxHistory.length > 0) {
      // Find the most recent cycle max on or before this session's date
      let applicableCM: number | null = null;
      for (let i = cycleMaxHistory.length - 1; i >= 0; i--) {
        if (cycleMaxHistory[i].date <= s.date) {
          applicableCM = cycleMaxHistory[i].weight;
          break;
        }
      }
      if (applicableCM && applicableCM > 0) {
        s.intensity = Math.round((s.topWeight / applicableCM) * 100);
        s.applicableCycleMax = applicableCM;
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
    exercise: { ...exercise, inputType, linkedNames },
    frequency: {
      last30d: count30d,
      last60d: count60d,
      perWeek30d,
      total: sessions.length,
    },
    lastSession,
    pr: prWeight,
    cycleMax: cycleMaxRecord,
    oneRepMax,
    tonnagePr,
    cycleMaxHistory,
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
      applicableCycleMax: s.applicableCycleMax,
    })),
    dayOfWeek,
    setPatterns,
  });
}
