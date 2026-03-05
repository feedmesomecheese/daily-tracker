import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

const TemplateExerciseSchema = z.object({
  exercise_id: z.string().uuid().nullable().optional(),
  exercise_name_display: z.string().min(1),
  modifier_ids: z.array(z.string().uuid()).default([]),
  exercise_order: z.number().int().default(0),
  target_sets: z.number().int().positive().nullable().optional(),
  target_reps: z.number().int().positive().nullable().optional(),
  target_weight: z.number().nullable().optional(),
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  workout_type_id: z.string().uuid().nullable().optional(),
  exercises: z.array(TemplateExerciseSchema).default([]),
});

// GET /api/workouts/templates — list all templates with their exercises
export async function GET(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: templates, error: tErr } = await supabase
    .from("workout_templates")
    .select("id, name, workout_type_id, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  if (!templates || templates.length === 0) return NextResponse.json([]);

  const templateIds = (templates as { id: string }[]).map((t) => t.id);
  const { data: exercises, error: exErr } = await supabase
    .from("workout_template_exercises")
    .select("id, template_id, exercise_id, exercise_name_display, modifier_ids, exercise_order, target_sets, target_reps, target_weight")
    .in("template_id", templateIds)
    .order("exercise_order", { ascending: true });

  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

  const exByTemplate = new Map<string, typeof exercises>();
  for (const ex of exercises ?? []) {
    if (!exByTemplate.has(ex.template_id)) exByTemplate.set(ex.template_id, []);
    exByTemplate.get(ex.template_id)!.push(ex);
  }

  const result = (templates as { id: string; name: string; workout_type_id: string | null; created_at: string }[]).map((t) => ({
    ...t,
    exercises: exByTemplate.get(t.id) ?? [],
  }));

  return NextResponse.json(result);
}

// POST /api/workouts/templates — create a new template
export async function POST(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateTemplateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  const { name, workout_type_id, exercises } = parsed.data;

  const { data: template, error: tErr } = await supabase
    .from("workout_templates")
    .insert({ owner_id: user.id, name: name.trim(), workout_type_id: workout_type_id ?? null })
    .select("id")
    .single();

  if (tErr || !template) return NextResponse.json({ error: tErr?.message ?? "Insert failed" }, { status: 500 });

  if (exercises.length > 0) {
    const rows = exercises.map((ex, i) => ({
      template_id: template.id,
      exercise_id: ex.exercise_id ?? null,
      exercise_name_display: ex.exercise_name_display,
      modifier_ids: ex.modifier_ids,
      exercise_order: ex.exercise_order ?? i,
      target_sets: ex.target_sets ?? null,
      target_reps: ex.target_reps ?? null,
      target_weight: ex.target_weight ?? null,
    }));

    const { error: exErr } = await supabase.from("workout_template_exercises").insert(rows);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: template.id });
}
