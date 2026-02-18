import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getLocalDateString, getServerTimezone } from "@/lib/dateUtils";

type AchievementCheck = {
  achievement_id: string;
  metric_id?: string;
  value?: Record<string, unknown>;
};

type LogEntry = {
  date: string;
  metric_id: string;
  value: unknown;
};

type AchievementDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tier: number;
  threshold: number | null;
};

export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tz = await getServerTimezone();
  const body = await req.json();
  const { date, metric_id } = body as { date?: string; metric_id?: string };

  // Run initial queries in parallel
  const [configResult, existingResult, definitionsResult] = await Promise.all([
    // Get metric config to check direction (skip neutral metrics)
    supabase
      .from("config")
      .select("metric_id, metric_name, analytics_config")
      .eq("owner_id", user.id),
    // Get existing achievements
    supabase
      .from("user_achievements")
      .select("achievement_id, metric_id")
      .eq("owner_id", user.id),
    // Get achievement definitions
    supabase.from("achievements").select("*"),
  ]);

  if (configResult.error) {
    return NextResponse.json({ error: configResult.error.message }, { status: 500 });
  }
  if (existingResult.error) {
    return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
  }
  if (definitionsResult.error) {
    return NextResponse.json({ error: definitionsResult.error.message }, { status: 500 });
  }

  const configData = configResult.data;
  const existingAchievements = existingResult.data;
  const definitions = definitionsResult.data;

  // Build map of metric config, filtering out neutral direction
  const metricConfig = new Map<string, { name: string; direction: string }>();
  for (const c of configData || []) {
    const direction = c.analytics_config?.direction || "increase";
    // Skip neutral metrics - they shouldn't have achievements
    if (direction !== "neutral") {
      metricConfig.set(c.metric_id, {
        name: c.metric_name,
        direction,
      });
    }
  }

  const existingSet = new Set(
    (existingAchievements || []).map(
      (a: { achievement_id: string; metric_id: string | null }) =>
        `${a.achievement_id}:${a.metric_id || ""}`
    )
  );

  // Only fetch logs for metrics we need to check and for a limited date range
  // For streak calculation, we only need recent logs (max 365 days for the longest streak)
  const today = new Date();
  const yearAgo = new Date(today);
  yearAgo.setDate(yearAgo.getDate() - 400); // 400 days to be safe for leap years
  const startDate = getLocalDateString(yearAgo, tz);

  const { data: logs, error: logError } = await supabase
    .from("log")
    .select("date, metric_id, value")
    .eq("owner_id", user.id)
    .gte("date", startDate)
    .not("value", "is", null)
    .order("date", { ascending: false });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  // Get total unique days count efficiently for consistency achievements
  const { count: totalDaysCount, error: countError } = await supabase
    .from("log")
    .select("date", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .not("value", "is", null);

  // Note: The above gives total rows, not unique dates
  // For unique dates we need a different approach - fetch just dates
  const { data: allDatesData } = await supabase
    .from("log")
    .select("date")
    .eq("owner_id", user.id)
    .not("value", "is", null);

  const totalUniqueDays = new Set(
    (allDatesData || []).map((d: { date: string }) => d.date)
  ).size;

  const defMap = new Map(
    (definitions || []).map((d: AchievementDefinition) => [d.id, d])
  );

  // Calculate metrics to check - only non-neutral metrics
  let metricsToCheck: string[];
  if (metric_id) {
    // Only check the specific metric if it's not neutral
    metricsToCheck = metricConfig.has(metric_id) ? [metric_id] : [];
  } else {
    // Check all non-neutral metrics that have logs
    const loggedMetrics: string[] = Array.from(new Set((logs || []).map((l: LogEntry) => l.metric_id)));
    metricsToCheck = loggedMetrics.filter((m: string) => metricConfig.has(m));
  }

  const newAchievements: AchievementCheck[] = [];

  // Helper: calculate streak for a metric
  function calculateStreak(metricId: string): number {
    const metricLogs = (logs || [])
      .filter((l: LogEntry) => l.metric_id === metricId)
      .map((l: LogEntry) => l.date)
      .sort()
      .reverse();

    if (metricLogs.length === 0) return 0;

    let streak = 1;
    const today = getLocalDateString(new Date(), tz);

    // Check if we have a log for today or yesterday
    const latestLog = metricLogs[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday, tz);

    if (latestLog !== today && latestLog !== yesterdayStr) {
      return 0; // Streak broken
    }

    // Count consecutive days
    for (let i = 1; i < metricLogs.length; i++) {
      const current = new Date(metricLogs[i - 1] + "T00:00:00");
      const prev = new Date(metricLogs[i] + "T00:00:00");
      const diffDays = Math.round(
        (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  // Helper: get total days logged (global, across all metrics)
  // Uses pre-calculated totalUniqueDays from all-time data
  function getTotalDaysLogged(): number {
    return totalUniqueDays;
  }

  // Streak achievements - only major milestones (skip 14)
  const streakThresholds = [
    { id: "streak_7", threshold: 7 },
    { id: "streak_30", threshold: 30 },
    { id: "streak_100", threshold: 100 },
    { id: "streak_365", threshold: 365 },
  ];

  for (const metricId of metricsToCheck) {
    const streak = calculateStreak(metricId);
    const config = metricConfig.get(metricId);

    for (const { id, threshold } of streakThresholds) {
      const key = `${id}:${metricId}`;
      if (streak >= threshold && !existingSet.has(key)) {
        newAchievements.push({
          achievement_id: id,
          metric_id: metricId,
          value: { streak, threshold, metric_name: config?.name },
        });
        existingSet.add(key);
      }
    }
  }

  // Global achievements (not per-metric)

  // First log achievement
  if ((logs || []).length > 0 && !existingSet.has("milestone_first_log:")) {
    newAchievements.push({
      achievement_id: "milestone_first_log",
      value: { first_date: (logs || [])[logs!.length - 1]?.date },
    });
    existingSet.add("milestone_first_log:");
  }

  // Total days logged milestones
  const totalDays = getTotalDaysLogged();

  if (totalDays >= 100 && !existingSet.has("consistency_100_days:")) {
    newAchievements.push({
      achievement_id: "consistency_100_days",
      value: { total_days: totalDays },
    });
    existingSet.add("consistency_100_days:");
  }

  if (totalDays >= 365 && !existingSet.has("consistency_365_days:")) {
    newAchievements.push({
      achievement_id: "consistency_365_days",
      value: { total_days: totalDays },
    });
    existingSet.add("consistency_365_days:");
  }

  // Insert new achievements
  if (newAchievements.length > 0) {
    const toInsert = newAchievements.map((a) => ({
      owner_id: user.id,
      achievement_id: a.achievement_id,
      metric_id: a.metric_id || null,
      value: a.value || null,
      notified: false,
    }));

    const { error: insertError } = await supabase
      .from("user_achievements")
      .insert(toInsert);

    if (insertError) {
      console.error("Failed to insert achievements:", insertError);
    }
  }

  // Get full details of new achievements for response
  const newWithDetails = newAchievements.map((a) => ({
    ...a,
    definition: defMap.get(a.achievement_id),
  }));

  return NextResponse.json({
    new_achievements: newWithDetails,
    checked_metrics: metricsToCheck.length,
  });
}
