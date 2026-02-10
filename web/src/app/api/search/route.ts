import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || "";
  const metricId = searchParams.get("metric_id") || null;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  if (!query) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  // Build the search query - using ilike for case-insensitive search
  let dbQuery = supabase
    .from("log")
    .select("date, metric_id, value_text")
    .eq("owner_id", user.id)
    .not("value_text", "is", null)
    .ilike("value_text", `%${query}%`)
    .order("date", { ascending: false })
    .limit(limit);

  // Filter by specific metric if provided
  if (metricId) {
    dbQuery = dbQuery.eq("metric_id", metricId);
  }

  const { data, error } = await dbQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
