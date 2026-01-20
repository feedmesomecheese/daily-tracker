import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendStreakAlertEmail } from "@/lib/email";
import { addDays, getLocalDateString } from "@/lib/dateUtils";

type NotificationConfig = {
  streak_alerts?: {
    enabled?: boolean;
    negative_thresholds?: number[];
    positive_thresholds?: number[];
    last_notified_threshold?: number | null;
    last_streak_sign?: "positive" | "negative" | "zero" | null;
  };
};

type MetricConfig = {
  owner_id: string;
  metric_id: string;
  metric_name: string;
  type: string;
  start_date: string | null;
  notification_config: NotificationConfig | null;
  analytics_config: Record<string, unknown> | null;
};

type LogRow = { date: string; value: number | null };

/**
 * GET /api/cron/check-notifications
 *
 * Called by Vercel Cron to check for streak threshold crossings and send notifications.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = getLocalDateString();
  console.log(`[CRON] check-notifications starting for ${today}`);

  try {
    // 1. Get all metrics with notification_config.streak_alerts.enabled = true
    const { data: metricsData, error: metricsError } = await supabaseAdmin
      .from("config")
      .select("owner_id, metric_id, metric_name, type, start_date, notification_config, analytics_config")
      .eq("active", true)
      .not("notification_config", "is", null);

    if (metricsError) {
      console.error("[CRON] Error fetching metrics:", metricsError);
      return NextResponse.json({ error: metricsError.message }, { status: 500 });
    }

    // Filter to only metrics with streak_alerts enabled
    const metrics = (metricsData as MetricConfig[] || []).filter((m) => {
      const config = m.notification_config;
      return config?.streak_alerts?.enabled === true;
    });

    if (metrics.length === 0) {
      console.log("[CRON] No metrics with notifications enabled");
      return NextResponse.json({ ok: true, checked: 0, notified: 0 });
    }

    console.log(`[CRON] Found ${metrics.length} metrics with notifications enabled`);

    // 2. Get unique owner IDs and their emails
    const ownerIds = Array.from(new Set(metrics.map((m) => m.owner_id)));
    const { data: usersData, error: usersError } = await supabaseAdmin
      .auth.admin.listUsers();

    if (usersError) {
      console.error("[CRON] Error fetching users:", usersError);
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const emailByOwnerId = new Map<string, string>();
    for (const user of usersData.users) {
      if (user.email && ownerIds.includes(user.id)) {
        emailByOwnerId.set(user.id, user.email);
      }
    }

    // 3. Process each metric
    let notificationsSent = 0;

    for (const metric of metrics) {
      const email = emailByOwnerId.get(metric.owner_id);
      if (!email) {
        console.log(`[CRON] No email for owner ${metric.owner_id}, skipping ${metric.metric_id}`);
        continue;
      }

      try {
        const result = await processMetricNotification(metric, email, today);
        if (result.notified) {
          notificationsSent++;
        }
      } catch (e) {
        console.error(`[CRON] Error processing ${metric.metric_id}:`, e);
      }
    }

    console.log(`[CRON] Complete. Checked ${metrics.length}, sent ${notificationsSent} notifications`);
    return NextResponse.json({
      ok: true,
      checked: metrics.length,
      notified: notificationsSent,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[CRON] Unexpected error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Process a single metric for notification
 */
async function processMetricNotification(
  metric: MetricConfig,
  email: string,
  referenceDate: string
): Promise<{ notified: boolean }> {
  const config = metric.notification_config!.streak_alerts!;
  const negativeThresholds = config.negative_thresholds || [];
  const positiveThresholds = config.positive_thresholds || [];
  const lastNotifiedThreshold = config.last_notified_threshold ?? null;
  const lastStreakSign = config.last_streak_sign ?? null;

  // Load log data for streak calculation (365 days lookback)
  const startDate = addDays(referenceDate, -365);
  const { data: logData, error: logError } = await supabaseAdmin
    .from("log")
    .select("date, value")
    .eq("owner_id", metric.owner_id)
    .eq("metric_id", metric.metric_id)
    .gte("date", startDate)
    .lte("date", referenceDate)
    .order("date", { ascending: true });

  if (logError) {
    throw new Error(`Failed to load logs: ${logError.message}`);
  }

  const logs = (logData as LogRow[]) || [];

  // Calculate current streak
  const streak = calculateStreakValue(logs, referenceDate, metric.start_date);
  const currentSign = streak > 0 ? "positive" : streak < 0 ? "negative" : "zero";

  console.log(`[CRON] ${metric.metric_id}: streak=${streak}, lastSign=${lastStreakSign}, lastThreshold=${lastNotifiedThreshold}`);

  // Check if streak sign changed (streak was reset)
  const signChanged = lastStreakSign !== null && lastStreakSign !== currentSign;

  let updatedConfig = { ...config };
  let shouldNotify = false;
  let notifyThreshold: number | null = null;

  if (signChanged) {
    // Streak was reset - clear last notified threshold
    console.log(`[CRON] ${metric.metric_id}: Streak sign changed from ${lastStreakSign} to ${currentSign}, resetting`);
    updatedConfig.last_notified_threshold = null;
    updatedConfig.last_streak_sign = currentSign;
  } else {
    updatedConfig.last_streak_sign = currentSign;
  }

  // Check thresholds based on current streak sign
  if (streak < 0 && negativeThresholds.length > 0) {
    // Negative streak - check negative thresholds
    // Thresholds are stored as negative numbers (e.g., [-20, -25, -30])
    // We want to notify when streak crosses each threshold
    const sortedThresholds = [...negativeThresholds].sort((a, b) => b - a); // -20, -25, -30

    for (const threshold of sortedThresholds) {
      if (streak <= threshold) {
        // Crossed this threshold
        const effectiveLastThreshold = signChanged ? null : lastNotifiedThreshold;

        if (effectiveLastThreshold === null || threshold < effectiveLastThreshold) {
          // Haven't notified for this threshold yet
          shouldNotify = true;
          notifyThreshold = threshold;
          break; // Only notify for the most severe uncrossed threshold
        }
      }
    }
  } else if (streak > 0 && positiveThresholds.length > 0) {
    // Positive streak - check positive thresholds (milestones)
    const sortedThresholds = [...positiveThresholds].sort((a, b) => a - b); // 10, 20, 30

    for (const threshold of sortedThresholds) {
      if (streak >= threshold) {
        const effectiveLastThreshold = signChanged ? null : lastNotifiedThreshold;

        if (effectiveLastThreshold === null || threshold > effectiveLastThreshold) {
          shouldNotify = true;
          notifyThreshold = threshold;
          // Don't break - we want the highest crossed threshold
        }
      }
    }
  }

  // Send notification if needed
  if (shouldNotify && notifyThreshold !== null) {
    console.log(`[CRON] ${metric.metric_id}: Sending notification for threshold ${notifyThreshold}`);

    const result = await sendStreakAlertEmail({
      to: email,
      metricName: metric.metric_name,
      streakDays: streak,
      date: referenceDate,
    });

    if (result.success) {
      updatedConfig.last_notified_threshold = notifyThreshold;
    } else {
      console.error(`[CRON] ${metric.metric_id}: Email failed: ${result.error}`);
      // Don't update threshold if email failed - will retry next run
      shouldNotify = false;
    }
  }

  // Update notification_config in database
  const { error: updateError } = await supabaseAdmin
    .from("config")
    .update({
      notification_config: {
        ...metric.notification_config,
        streak_alerts: updatedConfig,
      },
    })
    .eq("owner_id", metric.owner_id)
    .eq("metric_id", metric.metric_id);

  if (updateError) {
    console.error(`[CRON] ${metric.metric_id}: Failed to update config: ${updateError.message}`);
  }

  return { notified: shouldNotify };
}

/**
 * Calculate the current streak value for a metric
 * Positive = consecutive days with value, Negative = consecutive days without
 */
function calculateStreakValue(
  rows: LogRow[],
  referenceDate: string,
  startDate: string | null
): number {
  // Build set of logged dates
  const loggedDates = new Set<string>();
  for (const r of rows) {
    if (r.value !== null) {
      loggedDates.add(r.date);
    }
  }

  // Determine earliest date
  const earliestLog = rows.length > 0
    ? rows.reduce((min, r) => (r.date < min ? r.date : min), referenceDate)
    : referenceDate;
  const earliestDate = startDate && startDate < earliestLog ? startDate : earliestLog;

  if (referenceDate < earliestDate) {
    return 0;
  }

  const refDateLogged = loggedDates.has(referenceDate);
  let count = 0;
  let checkDate = referenceDate;

  if (refDateLogged) {
    // Count consecutive logged days
    while (checkDate >= earliestDate && loggedDates.has(checkDate)) {
      count++;
      checkDate = addDays(checkDate, -1);
    }
    return count;
  } else {
    // Count consecutive not-logged days
    while (checkDate >= earliestDate && !loggedDates.has(checkDate)) {
      count++;
      checkDate = addDays(checkDate, -1);
    }
    return -count;
  }
}
