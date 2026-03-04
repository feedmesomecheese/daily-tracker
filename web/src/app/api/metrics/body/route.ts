import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  async function fetchAllForMetric(
    metricId: string
  ): Promise<{ date: string; value: number }[]> {
    const PAGE_SIZE = 1000;
    const results: { date: string; value: number }[] = [];
    let offset = 0;

    while (true) {
      const { data, error: qErr } = await supabase
        .from("log")
        .select("date, value")
        .eq("owner_id", user!.id)
        .eq("metric_id", metricId)
        .not("value", "is", null)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (qErr || !data) break;
      for (const row of data) {
        if (row.value !== null) results.push({ date: row.date, value: row.value });
      }
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return results;
  }

  const [weight, bodyfat] = await Promise.all([
    fetchAllForMetric("weight"),
    fetchAllForMetric("bodyfat"),
  ]);

  return NextResponse.json({ weight, bodyfat });
}
