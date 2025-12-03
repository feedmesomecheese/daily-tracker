import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

const BaseSchema = z.object({
  metric_id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/i, "Use letters, numbers, and underscores only"),
  metric_name: z.string().min(1),
  type: z.enum(["checkbox", "number", "time", "hhmm"]),
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

  // you mentioned this earlier – keep it optional
  required: z.boolean().optional().default(false),
  required_since: z.string().nullable().optional(),
});

const CreateSchema = BaseSchema;
const UpdateSchema = BaseSchema.partial().extend({
  // metric_id is still required for updates
  metric_id: z.string().min(1),
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

  const todayISO = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("config").insert({
    owner_id: user.id,
    metric_id: body.metric_id.trim(),
    metric_name: body.metric_name.trim(),
    type: body.type,
    private: body.private ?? false,
    active: body.active ?? true,
    show_ma: body.show_ma ?? false,
    ma_periods_csv: body.ma_periods_csv ?? null,
    start_date: body.start_date && body.start_date.trim() !== "" ? body.start_date : null,
    default_value: body.default_value ?? null,
    min_value: body.min_value ?? null,
    max_value: body.max_value ?? null,
    disallowed_values: body.disallowed_values ?? null,
    required: body.required ?? false,
    required_since:
      body.required ?? false
        ? (body.required_since ?? todayISO)
        : null,
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
  if (body.required !== undefined) updates.required = body.required;
  if (body.required_since !== undefined) {
    updates.required_since =
      body.required ? body.required_since ?? new Date().toISOString().slice(0, 10)
                    : null;
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
