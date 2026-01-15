import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

// Default settings for new users
const DEFAULT_SETTINGS = {
  main_page: {
    show_indicators: true,
    show_trends: true,
    show_streaks: true,
  },
};

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Try to get existing settings
  const { data, error } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("owner_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found (expected for new users)
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return existing settings merged with defaults, or just defaults
  const settings = data?.settings
    ? deepMerge(DEFAULT_SETTINGS, data.settings)
    : DEFAULT_SETTINGS;

  return NextResponse.json(settings);
}

export async function PATCH(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let updates: Record<string, unknown>;
  try {
    updates = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Get existing settings first
  const { data: existing } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("owner_id", user.id)
    .single();

  // Deep merge: defaults <- existing <- updates
  const merged = deepMerge(
    DEFAULT_SETTINGS,
    existing?.settings ?? {},
    updates
  );

  // Upsert the merged settings
  const { data, error } = await supabase
    .from("user_settings")
    .upsert(
      {
        owner_id: user.id,
        settings: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" }
    )
    .select("settings")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data?.settings ?? merged);
}

// Deep merge utility - later sources override earlier ones
function deepMerge(
  ...sources: Record<string, unknown>[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const source of sources) {
    for (const key of Object.keys(source)) {
      const sourceVal = source[key];
      const resultVal = result[key];

      if (
        sourceVal &&
        typeof sourceVal === "object" &&
        !Array.isArray(sourceVal) &&
        resultVal &&
        typeof resultVal === "object" &&
        !Array.isArray(resultVal)
      ) {
        result[key] = deepMerge(
          resultVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>
        );
      } else {
        result[key] = sourceVal;
      }
    }
  }

  return result;
}
