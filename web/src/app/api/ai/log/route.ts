import { NextResponse } from "next/server";
import { validateAiRequest, getAiSupabase, AI_CORS_HEADERS, handleAiOptions } from "@/lib/aiAuth";

export async function OPTIONS() { return handleAiOptions(); }

export async function GET(req: Request) {
  const auth = await validateAiRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { ownerId } = auth;

  const supabase = getAiSupabase();

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const end = url.searchParams.get("end") || today;
  // If explicit start provided, use it; otherwise fall back to days param
  let start = url.searchParams.get("start") || "";
  if (!start) {
    const days = Math.min(parseInt(url.searchParams.get("days") || "30"), 3650);
    const startDate = new Date(end);
    startDate.setDate(startDate.getDate() - days + 1);
    start = startDate.toISOString().slice(0, 10);
  }

  const [configResult, logResult] = await Promise.all([
    supabase
      .from("config")
      .select("metric_id, metric_name, type, group")
      .eq("owner_id", ownerId)
      .eq("active", true),
    supabase
      .from("log")
      .select("date, metric_id, value")
      .eq("owner_id", ownerId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false }),
  ]);

  if (configResult.error) {
    return NextResponse.json({ error: configResult.error.message }, { status: 500 });
  }
  if (logResult.error) {
    return NextResponse.json({ error: logResult.error.message }, { status: 500 });
  }

  const metricMap = new Map(
    (configResult.data || []).map((m) => [m.metric_id, { name: m.metric_name, type: m.type, group: m.group }])
  );

  // Group log rows by date
  const byDate = new Map<string, Record<string, number | string | null>>();
  for (const row of logResult.data || []) {
    const meta = metricMap.get(row.metric_id);
    if (!meta) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, {});
    const entry = byDate.get(row.date)!;
    entry[meta.name] = row.value;
  }

  const entries = Array.from(byDate.entries())
    .map(([date, metrics]) => ({ date, metrics }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({
    period: { start, end },
    entries,
    metrics: (configResult.data || []).map((m) => ({
      id: m.metric_id,
      name: m.metric_name,
      type: m.type,
      group: m.group,
    })),
  }, { headers: AI_CORS_HEADERS });
}
