import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Today in local-ish ISO (we'll treat it as date string)
  const todayISO = new Date().toISOString().slice(0, 10);

  // 1) Get overall log bounds
  const { data: bounds, error: boundsError } = await supabase
    .from("log")
    .select("date")
    .eq("owner_id", user.id);

  if (boundsError) {
    return NextResponse.json(
      { error: boundsError.message },
      { status: 500 }
    );
  }

  let last_log_date: string | null = null;

  if (bounds && bounds.length > 0) {
    last_log_date = bounds
      .map((r) => r.date as string)
      .sort()
      .at(-1)!;
  }

  // 2) Fetch required metrics
  const { data: reqMetrics, error: reqError } = await supabase
    .from("config")
    .select("metric_id, required, required_since, start_date, active")
    .eq("owner_id", user.id)
    .eq("active", true)
    .eq("required", true);

  if (reqError) {
    return NextResponse.json(
      { error: reqError.message },
      { status: 500 }
    );
  }

  const required = reqMetrics ?? [];
  const requiredCount = required.length;

  let last_required_complete_date: string | null = null;
  let missing_required_days = 0;

  if (requiredCount > 0) {
    // earliest date when any required metric starts being "required"
    const effectiveStarts = required
      .map((m) => (m.required_since as string) || (m.start_date as string))
      .filter(Boolean) as string[];

    if (effectiveStarts.length > 0) {
      const minEffective = effectiveStarts.sort()[0];

      // Pull log rows for required metrics from that date onward
      const { data: rows, error: logError } = await supabase
        .from("log")
        .select("date, metric_id")
        .eq("owner_id", user.id)
        .gte("date", minEffective)
        .in(
          "metric_id",
          required.map((m) => m.metric_id)
        );

      if (logError) {
        return NextResponse.json(
          { error: logError.message },
          { status: 500 }
        );
      }

      // Group by date -> set of metric_ids
      const byDate: Record<string, Set<string>> = {};

      for (const row of rows ?? []) {
        const d = row.date as string;
        const mid = row.metric_id as string;
        if (!byDate[d]) byDate[d] = new Set<string>();
        byDate[d].add(mid);
      }

      const dates = Object.keys(byDate).sort();

      for (const d of dates) {
        const set = byDate[d];
        if (set.size === requiredCount) {
          // all required present for this date
          last_required_complete_date = d;
        }
      }

      if (last_required_complete_date) {
        const lastDate = new Date(last_required_complete_date);
        const today = new Date(todayISO);

        const diffMs = today.getTime() - lastDate.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        missing_required_days = Math.max(diffDays - 1, 0);
      }
    }
  }

  // 3) Suggested date logic
  let suggested_date: string = todayISO;

  if (last_required_complete_date) {
    // day after last fully complete required day, but not in future
    const d = new Date(last_required_complete_date);
    d.setDate(d.getDate() + 1);
    const candidate = d.toISOString().slice(0, 10);
    suggested_date = candidate > todayISO ? todayISO : candidate;
  } else if (last_log_date) {
    // If no complete required day yet, use last log date or today, whichever is later (but not > today)
    const candidate =
      last_log_date > todayISO ? todayISO : last_log_date;
    suggested_date = candidate;
  }

  return NextResponse.json({
    today: todayISO,
    last_log_date,
    last_required_complete_date,
    suggested_date,
    missing_required_days,
  });
}
