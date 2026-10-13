export type WorkoutType = {
  id: string;
  name: string;
  group_ids: string[];
};

export type ExerciseGroup = {
  id: string;
  name: string;
  short_code: string | null;
  input_type: string;
};

export type Exercise = {
  id: string;
  name: string;
  exercise_type: string;
  group_ids: string[];
  available_modifier_ids: string[];
};

export type Modifier = {
  id: string;
  name: string;
  adjective_order: number;
};

export type WorkoutExercise = {
  id?: string;
  exercise_id?: string | null;
  exercise_name_display: string;
  modifier_ids?: string[];
  include_in_tonnage?: boolean;
  exercise_order?: number;
  superset_group?: number | null;
  sets: {
    set_number: number;
    reps: number | null;
    weight: number | null;
    is_pr: boolean;
    is_cycle_max: boolean;
    is_missed: boolean;
    is_move_up: boolean;
  }[];
  duration_minutes?: number | null;
  distance_miles?: number | null;
  incline_pct?: number | null;
  weight?: number | null;
  time_on_seconds?: number | null;
  time_off_seconds?: number | null;
  cycles?: number | null;
  notes?: string | null;
};

export type ActivitySession = {
  id: string;
  workout_id: string;
  activity_type: string;
  duration_minutes: number | null;
  notes: string | null;
};

/** A parsed activity note (workout_activity_notes). `sections` is schemaless
 *  by design — order it with orderSectionKeys from @/lib/tennis/sections. */
export type WorkoutActivityNote = {
  id: string;
  workout_id: string;
  activity: string;
  status: "pending" | "parsed" | "skipped" | "failed";
  source_excerpt: string | null;
  mixed_note: boolean;
  is_activity_session: boolean;
  duplicate_of_workout_id: string | null;
  confidence: string | null;
  result: string | null;
  score: string | null;
  format: string | null;
  league: string | null;
  surface: string | null;
  partner: string | null;
  opponent: string | null;
  sections: Record<string, string>;
};

export type WorkoutTag = {
  id: string;
  name: string;
  default_type_ids: string[];
  sort_order: number;
  is_archived: boolean;
};

export type WorkoutHistory = {
  id: string;
  date: string;
  workout_type: string | null;
  workout_type_id: string | null;
  rating: number | null;
  duration_minutes: number | null;
  notes: string | null;
  exercises?: WorkoutExercise[];
  activity_sessions?: ActivitySession[];
  activity_notes?: WorkoutActivityNote[];
  applied_tag_ids?: string[];
  sets?: {
    exercise_name_display: string;
    set_number: number;
    reps: number | null;
    weight: number | null;
    is_pr: boolean;
    is_cycle_max: boolean;
    is_missed: boolean;
    is_move_up: boolean;
  }[];
};

export type ExerciseCentricEntry = {
  exercise_name_display: string;
  exercise_id: string | null;
  group_ids: string[];
  sessions: {
    workout_id: string;
    date: string;
    workout_type: string | null;
    workout_type_id: string | null;
    sets: WorkoutExercise["sets"];
    duration_minutes?: number | null;
    distance_miles?: number | null;
    incline_pct?: number | null;
    weight?: number | null;
    time_on_seconds?: number | null;
    time_off_seconds?: number | null;
    cycles?: number | null;
    notes?: string | null;
    tonnage: number;
  }[];
  totalTonnage: number;
  sessionCount: number;
};

export const SUPERSET_COLORS = [
  { border: "border-l-blue-400", bg: "bg-blue-400/10" },
  { border: "border-l-green-500", bg: "bg-green-500/10" },
  { border: "border-l-red-400", bg: "bg-red-400/10" },
  { border: "border-l-orange-400", bg: "bg-orange-400/10" },
  { border: "border-l-purple-400", bg: "bg-purple-400/10" },
];
