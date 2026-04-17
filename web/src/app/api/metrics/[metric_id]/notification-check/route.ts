import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { addDays, getLocalDateString, getServerTimezone } from "@/lib/dateUtils";

type LogRow = { date: string; value: number | null };

function calculateStreakValue(
  rows: LogRow[],
  referenceDate: string,
  startDate: string | null
): number {
  const loggedDates = new Set<string>();
  for (const r of rows) {
    if (r.value !== null) loggedDates.add(r.date);
  }

  const earliestLog = rows.length > 0
    ? rows.reduce((min, r) => (r.date < min ? r.date : min), referenceDate)
    : referenceDate;
  const earliestDate = startDate && startDate < earliestLog ? startDate : earliestLog;

  if (referenceDate < earliestDate) return 0;

  const refDateLogged = loggedDates.has(referenceDate);
  let count = 0;
  let checkDate = referenceDate;

  if (refDateLogged) {
    while (checkDate >= earliestDate && loggedDates.has(checkDate)) {
      count++;
      checkDate = addDays(checkDate, -1);
    }
    return count;
  } else {
    while (checkDate >= earliestDate && !loggedDates.has(checkDate)) {
      count++;
      checkDate = addDays(checkDate, -1);
    }
    return -count;
  }
}

// POST /api/metrics/[metric_id]/notification-check
// Runs the cron notification logic for a single metric and returns a diagnostic report.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ metric_id: string }> }
) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { metric_id } = await params;

  const { data: metricData, error: metricError } = await supabaseAdmin
    .from("config")
    .select("owner_id, metric_id, metric_name, type, start_date, notification_config")
    .eq("owner_id", user.id)
    .eq("metric_id", metric_id)
    .single();

  if (metricError || !metricData) {
    return NextResponse.json({ error: "Metric not found" }, { status: 404 });
  }

  const config = metricData.notification_config?.streak_alerts;
  if (!config) {
    return NextResponse.json({ error: "No notification config on this metric" }, { status: 400 });
  }

  const tz = await getServerTimezone();
  const today = getLocalDateString(new Date(), tz);
  const startDate = addDays(today, -365);

  const { data: logData, error: logError } = await supabaseAdmin
    .from("log")
    .select("date, value")
    .eq("owner_id", user.id)
    .eq("metric_id", metric_id)
    .gte("date", startDate)
    .lte("date", today)
    .order("date", { ascending: true });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  const logs = (logData as LogRow[]) || [];
  const streak = calculateStreakValue(logs, today, metricData.start_date);
  const currentSign = streak > 0 ? "positive" : streak < 0 ? "negative" : "zero";

  const negativeThresholds = config.negative_thresholds || [];
  const positiveThresholds = config.positive_thresholds || [];
  const lastNotifiedThreshold = config.last_notified_threshold ?? null;
  const lastStreakSign = config.last_streak_sign ?? null;

  const signChanged = lastStreakSign !== null && lastStreakSign !== currentSign;

  let wouldNotify = false;
  let notifyThreshold: number | null = null;
  const reasons: string[] = [];

  if (!config.enabled) {
    reasons.push("Notifications are disabled for this metric.");
  } else if (streak === 0) {
    reasons.push("Streak is 0 — no threshold to check.");
  } else if (streak < 0 && negativeThresholds.length === 0) {
    reasons.push("Streak is negative but no negative thresholds are configured.");
  } else if (streak > 0 && positiveThresholds.length === 0) {
    reasons.push("Streak is positive but no positive thresholds are configured.");
  } else if (streak < 0) {
    const sorted = [...negativeThresholds].sort((a, b) => b - a);
    for (const threshold of sorted) {
      if (streak <= threshold) {
        const effectiveLastThreshold = signChanged ? null : lastNotifiedThreshold;
        if (effectiveLastThreshold === null || threshold < effectiveLastThreshold) {
          wouldNotify = true;
          notifyThreshold = threshold;
          break;
        } else {
          reasons.push(`Already notified for threshold ${threshold} (last notified: ${lastNotifiedThreshold}).`);
          break;
        }
      }
    }
    if (!wouldNotify && reasons.length === 0) {
      reasons.push(`Streak (${streak}) hasn't reached any negative threshold yet (closest: ${sorted[0]}).`);
    }
  } else if (streak > 0) {
    const sorted = [...positiveThresholds].sort((a, b) => a - b);
    let highestCrossed: number | null = null;
    for (const threshold of sorted) {
      if (streak >= threshold) {
        const effectiveLastThreshold = signChanged ? null : lastNotifiedThreshold;
        if (effectiveLastThreshold === null || threshold > effectiveLastThreshold) {
          wouldNotify = true;
          highestCrossed = threshold;
        }
      }
    }
    notifyThreshold = highestCrossed;
    if (!wouldNotify && reasons.length === 0) {
      const uncrossed = sorted.find((t) => streak < t);
      if (uncrossed) {
        reasons.push(`Streak (${streak}) hasn't reached any new positive threshold yet (next: ${uncrossed}).`);
      } else {
        reasons.push(`Already notified for all crossed positive thresholds (last notified: ${lastNotifiedThreshold}).`);
      }
    }
  }

  return NextResponse.json({
    today,
    streak,
    currentSign,
    enabled: config.enabled,
    negativeThresholds,
    positiveThresholds,
    lastNotifiedThreshold,
    lastStreakSign,
    signChanged,
    wouldNotify,
    notifyThreshold,
    reasons,
  });
}
