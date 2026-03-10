import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

const VALID_NUTRIENTS = ["calories", "protein", "fat", "carbs", "fiber"] as const;
const VALID_DIRECTIONS = ["min", "max", "target"] as const;
const VALID_VALUE_TYPES = ["absolute", "per_lb_bodyweight", "pct_calories"] as const;

export async function GET(request: Request) {
  const supabase = supabaseServerFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("food_goals")
    .select("*")
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .order("nutrient");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = supabaseServerFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { nutrient, direction, value_type, value } = body;

  if (!VALID_NUTRIENTS.includes(nutrient)) {
    return NextResponse.json(
      { error: `nutrient must be one of: ${VALID_NUTRIENTS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!VALID_DIRECTIONS.includes(direction)) {
    return NextResponse.json(
      { error: `direction must be one of: ${VALID_DIRECTIONS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!VALID_VALUE_TYPES.includes(value_type)) {
    return NextResponse.json(
      { error: `value_type must be one of: ${VALID_VALUE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (value === undefined || value === null || isNaN(Number(value))) {
    return NextResponse.json({ error: "value is required and must be a number" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("food_goals")
    .insert({
      owner_id: user.id,
      nutrient,
      direction,
      value_type,
      value: Number(value),
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
