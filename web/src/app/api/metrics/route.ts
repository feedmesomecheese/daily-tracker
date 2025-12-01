import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

  default_value: z.number().nullable().optional(),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  disallowed_values: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  // required: z.boolean().optional().default(false), // if you added it
});

const CreateSchema = BaseSchema;

function formatZodError(error: z.ZodError): string {
  return error.errors.map((e) => e.message).join("; ");
}

export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const owner_id = auth.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error) },
      { status: 400 }
    );
  }

  const row = parsed.data;

  const { error } = await supabaseAdmin.from("config").insert({
    owner_id,
    ...row,
  });

  if (error) {
    // 23505 = unique_violation (duplicate metric_id for this owner)
    if ((error as any).code === "23505") {
      return NextResponse.json(
        { error: "metric_id already exists for this user" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
