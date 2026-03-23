import { NextResponse } from "next/server";
import { validateAiKey, getAiSupabase, getAiOwnerId, AI_CORS_HEADERS, handleAiOptions } from "@/lib/aiAuth";

export async function OPTIONS() { return handleAiOptions(); }

export async function GET(req: Request) {
  const authError = validateAiKey(req);
  if (authError) return authError;

  const supabase = getAiSupabase();
  const ownerId = getAiOwnerId();

  const url = new URL(req.url);
  const start = url.searchParams.get("start") || "";
  const end = url.searchParams.get("end") || new Date().toISOString().slice(0, 10);

  async function fetchMetric(metricId: string): Promise<{ date: string; value: number }[]> {
    const PAGE_SIZE = 1000;
    const results: { date: string; value: number }[] = [];
    let offset = 0;
    while (true) {
      let query = supabase
        .from("log")
        .select("date, value")
        .eq("owner_id", ownerId)
        .eq("metric_id", metricId)
        .not("value", "is", null)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (start) query = query.gte("date", start);
      if (end) query = query.lte("date", end);
      const { data, error } = await query;
      if (error || !data) break;
      results.push(...data.filter((r) => r.value !== null).map((r) => ({ date: r.date, value: r.value })));
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return results;
  }

  const [weight, bodyfat] = await Promise.all([
    fetchMetric("weight"),
    fetchMetric("bodyfat"),
  ]);

  return NextResponse.json({ period: { start: start || "all", end }, weight, bodyfat }, { headers: AI_CORS_HEADERS });
}
