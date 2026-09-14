import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recalculateFromDate } from "@/lib/recalculate";

/**
 * Daily-log write path, shared by the web UI (/api/save-log) and the agent
 * tool layer (/api/ai/log, MCP logMetrics).
 *
 * Extracted verbatim from the original route handler so both callers get the
 * same side effects: start_date backfill, streak-notification reset, forward
 * recalculation of dependent calculated metrics, and achievement checks.
 */

export type LogEntryInput = {
  metric_id: string;
  value: number | null;
  value_text?: string | null;
};

export type SaveLogResult = {
  upserted: number;
  deleted: number;
  recalculated: number;
  new_achievements: NewAchievement[];
};

type NewAchievement = {
  achievement_id: string;
  metric_id?: string;
  definition?: { name: string; icon: string };
};

function normalizeText(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s);
  return t.trim() === "" ? null : t;
}

export async function saveLogEntries(
  db: SupabaseClient,
  ownerId: string,
  date: string,
  entries: LogEntryInput[]
): Promise<SaveLogResult> {
  const toUpsert = entries.filter((e) => {
    const hasNumber = e.value !== null;
    const hasText = normalizeText(e.value_text) !== null;
    return hasNumber || hasText;
  });

  const toDelete = entries.filter((e) => {
    const noNumber = e.value === null;
    const noText = normalizeText(e.value_text) === null;
    return noNumber && noText;
  });

  if (toUpsert.length > 0) {
    const { error: upsertErr } = await db.from("log").upsert(
      toUpsert.map((e) => ({
        owner_id: ownerId,
        date,
        metric_id: e.metric_id,
        value: e.value,
        value_text: normalizeText(e.value_text),
      })),
      { onConflict: "owner_id,date,metric_id" }
    );

    if (upsertErr) throw new Error(upsertErr.message);
  }

  // Entries with neither a number nor text are a clear instruction.
  if (toDelete.length > 0) {
    const { error: delErr } = await db
      .from("log")
      .delete()
      .eq("owner_id", ownerId)
      .eq("date", date)
      .in("metric_id", toDelete.map((e) => e.metric_id));

    if (delErr) throw new Error(delErr.message);
  }

  if (toUpsert.length > 0) {
    const metricIds = Array.from(new Set(toUpsert.map((e) => e.metric_id)));

    // Auto-populate start_date for metrics that don't have it yet
    const { error } = await supabaseAdmin
      .from("config")
      .update({ start_date: date })
      .eq("owner_id", ownerId)
      .is("start_date", null)
      .in("metric_id", metricIds);

    if (error) throw new Error(error.message);

    // Saving a value breaks a negative streak, so clear the notification state
    // and let the next cron run evaluate the new streak from scratch.
    const { data: alertConfigs } = await supabaseAdmin
      .from("config")
      .select("metric_id, notification_config")
      .eq("owner_id", ownerId)
      .in("metric_id", metricIds)
      .not("notification_config", "is", null);

    if (alertConfigs) {
      for (const row of alertConfigs) {
        const alerts = row.notification_config?.streak_alerts;
        if (alerts?.enabled && alerts.last_streak_sign === "negative") {
          await supabaseAdmin
            .from("config")
            .update({
              notification_config: {
                ...row.notification_config,
                streak_alerts: {
                  ...alerts,
                  last_notified_threshold: null,
                  last_streak_sign: null,
                },
              },
            })
            .eq("owner_id", ownerId)
            .eq("metric_id", row.metric_id);
        }
      }
    }
  }

  // Recalculate forward so formulas using prev() pick up today's values.
  const recalcResult = await recalculateFromDate(db, ownerId, date);
  if (recalcResult.errors.length > 0) {
    console.warn("Recalculation warnings:", recalcResult.errors);
  }

  const newAchievements = await checkAchievements(
    db,
    ownerId,
    date,
    toUpsert.map((e) => e.metric_id)
  );

  return {
    upserted: toUpsert.length,
    deleted: toDelete.length,
    recalculated: recalcResult.daysProcessed,
    new_achievements: newAchievements,
  };
}

/** Non-blocking by contract: never throws, worst case returns []. */
async function checkAchievements(
  db: SupabaseClient,
  ownerId: string,
  date: string,
  metricIds: string[]
): Promise<NewAchievement[]> {
  if (metricIds.length === 0) return [];

  const newAchievements: NewAchievement[] = [];

  try {
    for (const metric_id of metricIds) {
      const { data: achievementData } = await db.functions
        .invoke("check-achievements", { body: { date, metric_id } })
        .catch(() => ({ data: null }));

      if (achievementData) continue;

      // Fallback: inline streak check if the edge function isn't deployed.
      const { data: logs } = await db
        .from("log")
        .select("date")
        .eq("owner_id", ownerId)
        .eq("metric_id", metric_id)
        .not("value", "is", null)
        .order("date", { ascending: false })
        .limit(400);

      if (!logs || logs.length < 7) continue;

      let streak = 1;
      for (let i = 1; i < logs.length; i++) {
        const current = new Date(logs[i - 1].date + "T00:00:00");
        const prev = new Date(logs[i].date + "T00:00:00");
        const diffDays = Math.round(
          (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays === 1) streak++;
        else break;
      }

      const streakAchievements = [
        { id: "streak_7", threshold: 7 },
        { id: "streak_14", threshold: 14 },
        { id: "streak_30", threshold: 30 },
        { id: "streak_100", threshold: 100 },
        { id: "streak_365", threshold: 365 },
      ];

      for (const sa of streakAchievements) {
        if (streak < sa.threshold) continue;
        const { data } = await db
          .from("user_achievements")
          .upsert(
            {
              owner_id: ownerId,
              achievement_id: sa.id,
              metric_id,
              value: { streak },
              notified: false,
            },
            { onConflict: "owner_id,achievement_id,metric_id", ignoreDuplicates: true }
          )
          .select();

        if (data && data.length > 0) {
          newAchievements.push({ achievement_id: sa.id, metric_id });
        }
      }
    }
  } catch (e) {
    console.warn("Achievement check failed (non-blocking):", e);
  }

  return newAchievements;
}
