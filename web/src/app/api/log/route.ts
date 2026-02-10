import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const year = searchParams.get("year"); // Optional year filter for heatmap

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Single date query - no pagination needed
  if (date) {
    const { data, error } = await supabase
      .from("log")
      .select("date,metric_id,value,value_text")
      .eq("owner_id", user.id)
      .eq("date", date)
      .order("date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  }

  // For range queries or full data fetch, use pagination to get all rows
  // (Supabase has a default row limit, typically 1000)
  const rows: unknown[] = [];
  const pageSize = 1000;
  let from = 0;
  const maxPages = 5000; // safety limit

  for (let page = 0; page < maxPages; page++) {
    let q = supabase
      .from("log")
      .select("date,metric_id,value,value_text")
      .eq("owner_id", user.id)
      .order("date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (start) q = q.gte("date", start);
    if (end) q = q.lte("date", end);
    if (year) {
      q = q.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const batch = data ?? [];
    rows.push(...batch);

    // If we got fewer than a full page, we're done
    if (batch.length < pageSize) break;

    from += pageSize;
  }

  return NextResponse.json(rows);
}
