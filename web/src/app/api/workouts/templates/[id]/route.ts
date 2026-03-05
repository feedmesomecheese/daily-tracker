import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  workout_type_id: z.string().uuid().nullable().optional(),
});

// PATCH /api/workouts/templates/[id] — rename or update type
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.workout_type_id !== undefined) updates.workout_type_id = parsed.data.workout_type_id;

  const { error } = await supabase
    .from("workout_templates")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/workouts/templates/[id]
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("workout_templates")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
