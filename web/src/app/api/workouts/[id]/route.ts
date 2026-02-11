import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

// GET /api/workouts/[id] - Get a single workout with sets
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

  const { data: workout, error } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  // Get sets
  const { data: sets } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("workout_id", id)
    .order("set_order", { ascending: true });

  // Get HIIT sessions
  const { data: hiitSessions } = await supabase
    .from("hiit_sessions")
    .select("*")
    .eq("workout_id", id);

  // Get cardio sessions
  const { data: cardioSessions } = await supabase
    .from("cardio_sessions")
    .select("*")
    .eq("workout_id", id);

  // Get activity sessions
  const { data: activitySessions } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("workout_id", id);

  return NextResponse.json({
    ...workout,
    sets: sets || [],
    hiit_sessions: hiitSessions || [],
    cardio_sessions: cardioSessions || [],
    activity_sessions: activitySessions || [],
  });
}

// PATCH /api/workouts/[id] - Update a workout
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const {
    date,
    workout_type,
    location,
    started_at,
    ended_at,
    duration_minutes,
    body_weight,
    body_fat_pct,
    notes,
  } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (date !== undefined) updates.date = date;
  if (workout_type !== undefined) updates.workout_type = workout_type;
  if (location !== undefined) updates.location = location;
  if (started_at !== undefined) updates.started_at = started_at;
  if (ended_at !== undefined) updates.ended_at = ended_at;
  if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes;
  if (body_weight !== undefined) updates.body_weight = body_weight;
  if (body_fat_pct !== undefined) updates.body_fat_pct = body_fat_pct;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from("workouts")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// DELETE /api/workouts/[id] - Delete a workout (cascades to sets)
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
