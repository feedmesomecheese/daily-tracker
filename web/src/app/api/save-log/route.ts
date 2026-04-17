import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { recalculateFromDate } from "@/lib/recalculate";

type Entry = {
  metric_id: string;
  value: number | null;
  value_text?: string | null;
};

export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  // Auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const owner_id = user.id;

  // Parse body
  const body = await req.json();
  const { date, entries } = body as {
    date: string;
    entries: {
      metric_id: string;
      value: number | null;
      value_text?: string | null;
    }[];
  };

  if (!date || !Array.isArray(entries)) {
    return NextResponse.json(
      { error: "Invalid payload: date or entries missing" },
      { status: 400 }
    );
  }

  console.log("SAVE-LOG parsed:", {
    owner_id: user.id,
    date,
    entriesCount: entries.length,
  });

  const normalizeText = (s: any): string | null => {
    if (s == null) return null;
    const t = String(s);
    return t.trim() === "" ? null : t;
  };

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

  // Upsert non-null values
  if (toUpsert.length > 0) {
    const { error: upsertErr } = await supabase
      .from("log")
      .upsert(
        toUpsert.map((e) => ({
          owner_id: user.id,
          date,
          metric_id: e.metric_id,
          value: e.value,
          value_text: normalizeText(e.value_text),
        })),
        { onConflict: "owner_id,date,metric_id" }
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
  }


  // Delete entries that were cleared (value === null)
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("log")
      .delete()
      .eq("owner_id", user.id)
      .eq("date", date)
      .in(
        "metric_id",
        toDelete.map((e) => e.metric_id)
      );

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  // Auto-populate start_date for metrics that don't have it yet
  if (toUpsert.length > 0) {
    const metricIds = Array.from(new Set(toUpsert.map((e) => e.metric_id)));

    const { error } = await supabaseAdmin
      .from("config")
      .update({ start_date: date })
      .eq("owner_id", owner_id)
      .is("start_date", null)
      .in("metric_id", metricIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-reset streak notification state for any metric that was in a negative streak.
    // Saving a value breaks the negative streak, so clear last_notified_threshold and
    // last_streak_sign so the next cron run evaluates the new streak from scratch.
    const { data: alertConfigs } = await supabaseAdmin
      .from("config")
      .select("metric_id, notification_config")
      .eq("owner_id", owner_id)
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
            .eq("owner_id", owner_id)
            .eq("metric_id", row.metric_id);
        }
      }
    }
  }

  // Recalculate forward from this date to update any dependent calculated metrics
  // This handles formulas using prev() that depend on today's saved data
  const recalcResult = await recalculateFromDate(supabase, owner_id, date);

  if (recalcResult.errors.length > 0) {
    console.warn("Recalculation warnings:", recalcResult.errors);
  }

  // Check for new achievements (async, don't block response)
  const metricsToCheck = toUpsert.map((e) => e.metric_id);
  let newAchievements: { achievement_id: string; metric_id?: string; definition?: { name: string; icon: string } }[] = [];

  if (metricsToCheck.length > 0) {
    try {
      // Check achievements for each metric that was updated
      for (const metric_id of metricsToCheck) {
        const { data: achievementData } = await supabase.functions.invoke("check-achievements", {
          body: { date, metric_id },
        }).catch(() => ({ data: null }));

        // Fallback: inline check if function doesn't exist
        if (!achievementData) {
          // Basic streak check inline
          const { data: logs } = await supabase
            .from("log")
            .select("date")
            .eq("owner_id", owner_id)
            .eq("metric_id", metric_id)
            .not("value", "is", null)
            .order("date", { ascending: false })
            .limit(400);

          if (logs && logs.length >= 7) {
            // Check for consecutive days
            let streak = 1;
            for (let i = 1; i < logs.length; i++) {
              const current = new Date(logs[i - 1].date + "T00:00:00");
              const prev = new Date(logs[i].date + "T00:00:00");
              const diffDays = Math.round((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays === 1) streak++;
              else break;
            }

            // Award streak achievements
            const streakAchievements = [
              { id: "streak_7", threshold: 7 },
              { id: "streak_14", threshold: 14 },
              { id: "streak_30", threshold: 30 },
              { id: "streak_100", threshold: 100 },
              { id: "streak_365", threshold: 365 },
            ];

            for (const sa of streakAchievements) {
              if (streak >= sa.threshold) {
                // Try to insert (will fail silently if already exists due to unique constraint)
                await supabase
                  .from("user_achievements")
                  .upsert(
                    {
                      owner_id,
                      achievement_id: sa.id,
                      metric_id,
                      value: { streak },
                      notified: false,
                    },
                    { onConflict: "owner_id,achievement_id,metric_id", ignoreDuplicates: true }
                  )
                  .then(({ data }: { data: unknown }) => {
                    if (data) {
                      newAchievements.push({ achievement_id: sa.id, metric_id });
                    }
                  })
                  .catch(() => {});
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Achievement check failed (non-blocking):", e);
    }
  }

  console.log("SAVE-LOG complete:", {
    date,
    upserted: toUpsert.length,
    deleted: toDelete.length,
    recalcDays: recalcResult.daysProcessed,
    newAchievements: newAchievements.length,
  });

  return NextResponse.json({
    ok: true,
    recalculated: recalcResult.daysProcessed,
    new_achievements: newAchievements,
  });
}
