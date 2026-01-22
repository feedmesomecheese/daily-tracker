import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getLocalDateString } from "@/lib/dateUtils";

// Analytics config schema
const AnalyticsConfigSchema = z.object({
  hide_trend: z.boolean().optional(),
  hide_streak: z.boolean().optional(), // deprecated, use show_streak
  show_streak: z.boolean().optional(), // default: true
  streak_mode: z.enum(['positive', 'days_since', 'none']).optional(), // deprecated
  avoid: z.boolean().optional(), // if true, negative streaks show flame (avoiding bad thing)
  lifetime_streak: z.boolean().optional(), // if true, load all-time data for streak calc
  streak_seed: z.number().int().min(0).optional(), // pre-log days to add to streak display
  trend_period: z.number().int().positive().optional(),
  higher_is_better: z.boolean().optional(), // true = up is green, false = down is green
}).nullable().optional();

// Notification config schema
const NotificationConfigSchema = z.object({
  streak_alerts: z.object({
    enabled: z.boolean().optional(),
    // Thresholds to trigger notifications (e.g., [-20, -25, -30] for negative streaks)
    negative_thresholds: z.array(z.number().int().max(0)).optional(),
    positive_thresholds: z.array(z.number().int().min(0)).optional(),
    // Track last notified threshold to avoid duplicate emails
    last_notified_threshold: z.number().int().nullable().optional(),
    // Track streak sign to detect when streak resets
    last_streak_sign: z.enum(['positive', 'negative', 'zero']).nullable().optional(),
  }).optional(),
}).nullable().optional();

// Goal alert config (shared across goal types)
const GoalAlertConfig = z.object({
  approaching_pct: z.number().min(0).max(100).optional(), // notify at X% progress
  missed: z.boolean().optional(), // notify when period ends without meeting goal
  achieved: z.boolean().optional(), // notify when goal is achieved
}).optional();

// Base fields shared by all goal types
const GoalBaseFields = {
  id: z.string().min(1), // unique ID for this goal
  name: z.string().min(1), // display name
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  enabled: z.boolean().default(true),
  start_date: z.string().nullable().optional(), // YYYY-MM-DD, null = no start limit
  end_date: z.string().nullable().optional(), // YYYY-MM-DD, null = ongoing
  alerts: GoalAlertConfig,
  created_at: z.string().optional(), // ISO timestamp
};

// Numeric goal (for number/time metrics) - sum or average target
const NumericGoalSchema = z.object({
  ...GoalBaseFields,
  type: z.literal('numeric'),
  target: z.number(),
  measure: z.enum(['sum', 'average']), // sum = total, average = per-logged-day avg
  direction: z.enum(['gte', 'lte']), // >= or <= target
});

// Checkbox goal - count of times checked per period
const CheckboxGoalSchema = z.object({
  ...GoalBaseFields,
  type: z.literal('checkbox'),
  target_count: z.number().int().min(1), // times per day/week/month
});

// HHMM target time goal (e.g., wake by 7:00 AM)
const HHMMTargetGoalSchema = z.object({
  ...GoalBaseFields,
  type: z.literal('hhmm_target'),
  target_time: z.number().int().min(0).max(1439), // minutes from midnight (0-1439)
  direction: z.enum(['before', 'after']), // "before" = <= target, "after" = >= target
});

// HHMM consistency goal - standard deviation within X minutes
const HHMMConsistencyGoalSchema = z.object({
  ...GoalBaseFields,
  type: z.literal('hhmm_consistency'),
  max_std_dev: z.number().int().min(1), // maximum std dev in minutes
});

// Numeric threshold goal - count days meeting threshold (e.g., "score >= 7 on 5 days/week")
const NumericThresholdGoalSchema = z.object({
  ...GoalBaseFields,
  type: z.literal('numeric_threshold'),
  threshold: z.number(),
  direction: z.enum(['gte', 'lte']), // value must be >= or <= threshold
  target_count: z.number().int().min(1), // how many days must meet threshold
});

// Union of all goal types
const GoalSchema = z.discriminatedUnion('type', [
  NumericGoalSchema,
  NumericThresholdGoalSchema,
  CheckboxGoalSchema,
  HHMMTargetGoalSchema,
  HHMMConsistencyGoalSchema,
]);

// Goals config schema
const GoalsConfigSchema = z.object({
  goals: z.array(GoalSchema).default([]),
}).nullable().optional();

const BaseSchema = z.object({
  metric_id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/i, "Use letters, numbers, and underscores only"),
  metric_name: z.string().min(1),
  type: z.enum(["checkbox", "number", "time", "hhmm", "text"]),
  private: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true),
  show_ma: z.boolean().optional().default(false),
  ma_periods_csv: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),

  // validation fields
  default_value: z.number().nullable().optional(),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  disallowed_values: z.string().nullable().optional(),

  required: z.boolean().optional().default(false),
  required_since: z.string().nullable().optional(),

  group: z.string().nullable().optional(),
  metric_order: z.number().int().nullable().optional(),
  group_order: z.number().int().nullable().optional(),

  // calculated metrics (defaults ONLY for create)
  is_calculated: z.boolean().optional().default(false),
  calc_expr: z.string().nullable().optional().default(null),

  // dependent metrics
  parent_metric_id: z.string().nullable().optional(),

  // presets (comma-separated values)
  preset_values_csv: z.string().nullable().optional(),

  // analytics configuration
  analytics_config: AnalyticsConfigSchema,

  // notification configuration
  notification_config: NotificationConfigSchema,

  // goals configuration
  goals_config: GoalsConfigSchema,
});

// CREATE uses defaults; PATCH must NOT apply defaults for fields the client didn't send.
const CreateSchema = BaseSchema;

const UpdateSchema = z.object({
  // metric_id is still required for updates
  metric_id: z.string().min(1),

  // everything else optional, NO defaults (prevents accidental overwrites during reorder)
  metric_name: z.string().min(1).optional(),
  type: z.enum(["checkbox", "number", "time", "hhmm", "text"]).optional(),
  private: z.boolean().optional(),
  active: z.boolean().optional(),
  show_ma: z.boolean().optional(),
  ma_periods_csv: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),

  default_value: z.number().nullable().optional(),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  disallowed_values: z.string().nullable().optional(),

  required: z.boolean().optional(),
  required_since: z.string().nullable().optional(),

  group: z.string().nullable().optional(),
  metric_order: z.number().int().nullable().optional(),
  group_order: z.number().int().nullable().optional(),

  is_calculated: z.boolean().optional(),
  calc_expr: z.string().nullable().optional(),

  // dependent metrics
  parent_metric_id: z.string().nullable().optional(),

  // presets
  preset_values_csv: z.string().nullable().optional(),

  // analytics configuration
  analytics_config: AnalyticsConfigSchema,

  // notification configuration
  notification_config: NotificationConfigSchema,

  // goals configuration
  goals_config: GoalsConfigSchema,
});

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ") || "Invalid input";
}

// ---------- helpers ----------

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null };
  }
  return { supabase, user };
}

// Look up the group_order for a given group name
// Returns the group_order from any existing metric in that group, or null if not found
async function getGroupOrderForGroup(
  supabase: ReturnType<typeof supabaseServerFromRequest>,
  userId: string,
  groupName: string | null
): Promise<number | null> {
  if (!groupName) return null;

  const { data } = await supabase
    .from("config")
    .select("group_order")
    .eq("owner_id", userId)
    .eq("group", groupName)
    .limit(1)
    .single();

  return data?.group_order ?? null;
}

// ---------- POST /api/metrics (create) ----------

export async function POST(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error) },
      { status: 400 },
    );
  }

  const body = parsed.data;

  const todayISO = getLocalDateString();

  // Auto-set group_order based on existing metrics in the same group
  let groupOrder = body.group_order;
  if (groupOrder == null && body.group) {
    const existingGroupOrder = await getGroupOrderForGroup(supabase, user.id, body.group);
    groupOrder = existingGroupOrder ?? 0;
  }

  const { error } = await supabase.from("config").insert({
    owner_id: user.id,
    metric_id: body.metric_id.trim(),
    metric_name: body.metric_name.trim(),
    type: body.type,
    private: body.private ?? false,
    active: body.active ?? true,
    show_ma: body.show_ma ?? false,
    ma_periods_csv: body.ma_periods_csv ?? null,
    start_date:
      body.start_date && body.start_date.trim() !== ""
        ? body.start_date
        : null,
    default_value: body.default_value ?? null,
    min_value: body.min_value ?? null,
    max_value: body.max_value ?? null,
    disallowed_values: body.disallowed_values ?? null,
    required: body.required ?? false,
    required_since:
      body.required ?? false
        ? body.required_since ?? todayISO
        : null,

    group: body.group ?? null,
    metric_order: body.metric_order ?? 0,
    group_order: groupOrder ?? 0,
    is_calculated: body.is_calculated ?? false,
    calc_expr: body.calc_expr ?? null,
    parent_metric_id: body.parent_metric_id ?? null,
    preset_values_csv: body.preset_values_csv ?? null,
  });


  if (error) {
    // unique violation → nicer message
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "metric_id already exists" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message || "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

// ---------- PATCH /api/metrics (update by metric_id) ----------

export async function PATCH(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const todayISO = getLocalDateString();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error) },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const metric_id = body.metric_id.trim();

  // Build update object only with provided fields
  const updates: Record<string, any> = {};

  if (body.metric_name !== undefined)
    updates.metric_name = body.metric_name.trim();
  if (body.type !== undefined) updates.type = body.type;
  if (body.private !== undefined) updates.private = body.private;
  if (body.active !== undefined) updates.active = body.active;
  if (body.show_ma !== undefined) updates.show_ma = body.show_ma;
  if (body.ma_periods_csv !== undefined)
    updates.ma_periods_csv = body.ma_periods_csv ?? null;
  if (body.start_date !== undefined)
    updates.start_date = body.start_date ?? null;
  if (body.default_value !== undefined)
    updates.default_value = body.default_value ?? null;
  if (body.min_value !== undefined) updates.min_value = body.min_value ?? null;
  if (body.max_value !== undefined) updates.max_value = body.max_value ?? null;
  if (body.disallowed_values !== undefined)
    updates.disallowed_values = body.disallowed_values ?? null;
  if (body.required !== undefined) updates.required = body.required;
  
  if (body.is_calculated !== undefined) updates.is_calculated = body.is_calculated;
  if (body.calc_expr !== undefined) updates.calc_expr = body.calc_expr;
  if (body.parent_metric_id !== undefined) updates.parent_metric_id = body.parent_metric_id ?? null;
  if (body.preset_values_csv !== undefined) updates.preset_values_csv = body.preset_values_csv ?? null;
  if (body.analytics_config !== undefined) updates.analytics_config = body.analytics_config ?? {};
  if (body.notification_config !== undefined) updates.notification_config = body.notification_config ?? {};
  if (body.goals_config !== undefined) updates.goals_config = body.goals_config ?? {};

  if (body.group !== undefined) {
    updates.group = body.group ?? null;

    // Auto-update group_order when group changes (unless explicitly provided)
    if (body.group_order === undefined && body.group) {
      const existingGroupOrder = await getGroupOrderForGroup(supabase, user.id, body.group);
      if (existingGroupOrder != null) {
        updates.group_order = existingGroupOrder;
      }
    }
  }
  if (body.metric_order !== undefined) {
    updates.metric_order = body.metric_order;
  }
  if (body.group_order !== undefined) {
    updates.group_order =
      body.group_order != null ? body.group_order : 0;
  }
  
  // Required_since policy:
  // - If required is being turned ON and caller didn't provide required_since, set it today
  // - If required is being turned OFF, clear required_since
  if (body.required === true && body.required_since === undefined) {
    updates.required_since = todayISO;
  }
  if (body.required === false) {
    updates.required_since = null;
  }




  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 },
    );
  }

    const { data, error } = await supabase
      .from("config")
      .update(updates)
      .eq("owner_id", user.id)
      .eq("metric_id", metric_id)
      .select("metric_id");

    if (error) {
      return NextResponse.json(
        { error: error.message || "Update failed" },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Metric not found for this user" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });

}
