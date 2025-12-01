import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

const UpdateSchema = z.object({
  metric_name: z.string().min(1).optional(),
  type: z.enum(["checkbox", "number", "time", "hhmm"]).optional(),
  private: z.boolean().optional(),
  active: z.boolean().optional(),
  show_ma: z.boolean().optional(),
  ma_periods_csv: z.string().nullable().optional(),
  default_value: z.number().nullable().optional(),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  disallowed_values: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  // if you ended up adding required: z.boolean().optional(),
});

function formatZodError(error: z.ZodError): string {
  return error.errors.map((e) => e.message).join("; ");
}

export async function PATCH(
  req: Request,
  { params }: { params: { metric_id: string } }
) {
  const supabase = supabaseServerFromRequest(req);
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const owner_id = auth.user.id;
  const metric_id = params.metric_id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("config")
    .update(parsed.data)
    .eq("owner_id", owner_id)
    .eq("metric_id", metric_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
