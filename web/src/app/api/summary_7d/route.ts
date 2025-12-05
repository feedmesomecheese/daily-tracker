// web/src/app/api/summary_7d/route.ts
import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type SummaryRow = {
  metric_id: string;
  type: string;
  n_rows: number | null;
  sum_7d: number | null;
  count_true_7d: number | null;
  avg_7d: number | null;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  // Auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");

  const today = todayISO();
  const endDate = dateParam && dateParam < today ? dateParam : today;
  const startDate = addDays(endDate, -6); // 7-day window

  // 1) Load config to know metric types
  const { data: configRows, error: configError } = await supabase
    .from("config")
    .select("metric_id, type, active, private")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (configError) {
    return NextResponse.json(
      { error: `Failed to load config: ${configError.message}` },
      { status: 500 }
    );
  }

  const metrics = (configRows ?? []).filter((m) => !m.private);
  const metricTypeMap = new Map<string, string>();
  for (const m of metrics) {
    metricTypeMap.set(m.metric_id, m.type as string);
  }

  if (metricTypeMap.size === 0) {
    return NextResponse.json([] satisfies SummaryRow[]);
  }

  const metricIds = Array.from(metricTypeMap.keys());

  // 2) Load logs for the 7-day window for this user + these metrics
  const { data: logRows, error: logError } = await supabase
    .from("log")
    .select("metric_id, date, value")
    .eq("owner_id", user.id)
    .in("metric_id", metricIds)
    .gte("date", startDate)
    .lte("date", endDate);

  if (logError) {
    return NextResponse.json(
      { error: `Failed to load logs: ${logError.message}` },
      { status: 500 }
    );
  }

  type LogRow = { metric_id: string; date: string; value: any };

  // 3) Group by metric_id
  const byMetric = new Map<string, LogRow[]>();
  for (const row of (logRows ?? []) as LogRow[]) {
    if (!byMetric.has(row.metric_id)) byMetric.set(row.metric_id, []);
    byMetric.get(row.metric_id)!.push(row);
  }

  const summary: SummaryRow[] = [];

  for (const metric_id of metricIds) {
    const type = metricTypeMap.get(metric_id) ?? "number";
    const rows = byMetric.get(metric_id) ?? [];

    if (rows.length === 0) {
      summary.push({
        metric_id,
        type,
        n_rows: 0,
        sum_7d: null,
        count_true_7d: null,
        avg_7d: null,
      });
      continue;
    }

    let n_rows = 0;
    let sum_7d = 0;
    let count_true_7d = 0;

    for (const r of rows) {
      const raw = r.value;

      if (type === "checkbox") {
        const isTrue = !!raw && Number(raw) !== 0;
        if (isTrue) {
          count_true_7d += 1;
          n_rows += 1;
        }
      } else {
        // number, time, hhmm -> treat as numeric
        const num = raw == null ? null : Number(raw);
        if (num != null && !Number.isNaN(num)) {
          sum_7d += num;
          n_rows += 1;
        }
      }
    }

    let avg_7d: number | null = null;
    if (n_rows > 0 && type !== "checkbox") {
      avg_7d = sum_7d / n_rows;
    }

    summary.push({
      metric_id,
      type,
      n_rows,
      sum_7d: n_rows > 0 && type !== "checkbox" ? sum_7d : null,
      count_true_7d: type === "checkbox" ? count_true_7d : null,
      avg_7d,
    });
  }

  // sort for stable display
  summary.sort((a, b) => {
    if (a.type === b.type) return a.metric_id.localeCompare(b.metric_id);
    return a.type.localeCompare(b.type);
  });

  return NextResponse.json(summary);
}
