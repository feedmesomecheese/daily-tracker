import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

const VALID_NUTRIENTS = ["calories", "protein", "fat", "carbs", "fiber"] as const;
const VALID_DIRECTIONS = ["min", "max", "target"] as const;
const VALID_VALUE_TYPES = ["absolute", "per_lb_bodyweight", "pct_calories"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = supabaseServerFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { nutrient, direction, value_type, value, is_active } = body;

  const updates: Record<string, unknown> = {};

  if (nutrient !== undefined) {
    if (!VALID_NUTRIENTS.includes(nutrient)) {
      return NextResponse.json(
        { error: `nutrient must be one of: ${VALID_NUTRIENTS.join(", ")}` },
        { status: 400 }
      );
    }
    updates.nutrient = nutrient;
  }
  if (direction !== undefined) {
    if (!VALID_DIRECTIONS.includes(direction)) {
      return NextResponse.json(
        { error: `direction must be one of: ${VALID_DIRECTIONS.join(", ")}` },
        { status: 400 }
      );
    }
    updates.direction = direction;
  }
  if (value_type !== undefined) {
    if (!VALID_VALUE_TYPES.includes(value_type)) {
      return NextResponse.json(
        { error: `value_type must be one of: ${VALID_VALUE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    updates.value_type = value_type;
  }
  if (value !== undefined) {
    if (isNaN(Number(value))) {
      return NextResponse.json({ error: "value must be a number" }, { status: 400 });
    }
    updates.value = Number(value);
  }
  if (is_active !== undefined) {
    updates.is_active = Boolean(is_active);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("food_goals")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = supabaseServerFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error, count } = await supabase
    .from("food_goals")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (count === 0) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
