import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerTimezone, getLocalDateString, addDays } from "@/lib/dateUtils";

export async function POST(req: Request) {
  try {
    const supabase = supabaseServerFromRequest(req);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Use first 8 chars of user ID to make metric_ids unique per user
    // (metric_id is globally unique in the config table, not per owner_id)
    const uid = user.id.replace(/-/g, "").slice(0, 8);
    const prefix = `__demo_${uid}_`;

    // Always delete any stale demo data first so we always seed with the latest config
    const { error: cleanLogErr } = await supabaseAdmin
      .from("log")
      .delete()
      .eq("owner_id", user.id)
      .like("metric_id", `${prefix}%`);
    if (cleanLogErr) console.warn("[tour/seed] Pre-clean log failed:", cleanLogErr.message);

    const { error: cleanCfgErr } = await supabaseAdmin
      .from("config")
      .delete()
      .eq("owner_id", user.id)
      .like("metric_id", `${prefix}%`);
    if (cleanCfgErr) console.warn("[tour/seed] Pre-clean config failed:", cleanCfgErr.message);

    const tz = await getServerTimezone();
    const today = getLocalDateString(new Date(), tz);

    // Both metric_id and metric_name have global unique constraints across all users,
    // so both must include the user-scoped uid token.
    const n = (name: string) => `${name} [${uid}]`;

    const demoMetrics = [
      { owner_id: user.id, metric_id: `${prefix}exercise`, metric_name: n("Exercise"), type: "checkbox", group: "Tour Demo", group_order: 9999, metric_order: 1, active: true, required: false, private: false, show_ma: false, analytics_config: { direction: "increase", show_streak: true } },
      { owner_id: user.id, metric_id: `${prefix}notes`, metric_name: n("Daily Notes"), type: "text", group: "Tour Demo", group_order: 9999, metric_order: 2, active: true, required: false, private: false, show_ma: false },
      { owner_id: user.id, metric_id: `${prefix}weight`, metric_name: n("Weight (lbs)"), type: "number", group: "Tour Demo", group_order: 9999, metric_order: 3, active: true, required: false, private: false, show_ma: false, analytics_config: { direction: "neutral", show_streak: false } },
      { owner_id: user.id, metric_id: `${prefix}drinks`, metric_name: n("Alcoholic Drinks"), type: "count", group: "Tour Demo", group_order: 9999, metric_order: 4, active: true, required: false, private: false, show_ma: false, analytics_config: { direction: "decrease", show_streak: false } },
      { owner_id: user.id, metric_id: `${prefix}sleep_rating`, metric_name: n("Sleep Rating"), type: "score", min_value: 1, max_value: 10, group: "Tour Demo", group_order: 9999, metric_order: 5, active: true, required: false, private: false, show_ma: false, analytics_config: { direction: "increase", show_streak: false } },
      { owner_id: user.id, metric_id: `${prefix}bed_time`, metric_name: n("Bed Time"), type: "hhmm", group: "Tour Demo", group_order: 9999, metric_order: 6, active: true, required: false, private: false, show_ma: false, analytics_config: { direction: "neutral", show_streak: false } },
      { owner_id: user.id, metric_id: `${prefix}reading`, metric_name: n("Reading Time"), type: "time", group: "Tour Demo", group_order: 9999, metric_order: 7, active: true, required: false, private: false, show_ma: false, analytics_config: { direction: "increase", show_streak: false } },
    ];

    const { error: configErr } = await supabaseAdmin
      .from("config")
      .insert(demoMetrics);

    if (configErr) {
      console.error("[tour/seed] Config insert failed:", configErr.code, configErr.message);
      return NextResponse.json({ error: configErr.message, code: configErr.code }, { status: 500 });
    }

    // Generate 90 days of historical log data
    const logRows: { owner_id: string; date: string; metric_id: string; value: number | null; value_text: string | null }[] = [];

    let rngState = 42;
    function rng(): number {
      rngState = (rngState * 1664525 + 1013904223) & 0xffffffff;
      return (rngState >>> 0) / 0x100000000;
    }

    for (let i = 90; i >= 0; i--) {
      const date = addDays(today, -i);
      const dayOfWeek = new Date(date + "T00:00:00").getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const progress = (90 - i) / 90;

      // Guarantee exercise for the last 7 days so the streak is always visible
      if (i <= 6 || rng() < 0.55 + progress * 0.25) {
        logRows.push({ owner_id: user.id, date, metric_id: `${prefix}exercise`, value: 1, value_text: null });
      }

      const weight = Math.round((185 - progress * 4 + (rng() - 0.5) * 4) * 10) / 10;
      logRows.push({ owner_id: user.id, date, metric_id: `${prefix}weight`, value: weight, value_text: null });

      const drinksChance = isWeekend ? 0.5 : 0.2;
      const drinks = rng() < drinksChance ? Math.floor(rng() * (isWeekend ? 2 : 1)) + 1 : 0;
      logRows.push({ owner_id: user.id, date, metric_id: `${prefix}drinks`, value: drinks, value_text: null });

      const sleepRating = Math.min(10, Math.max(1, Math.round(6.5 + progress * 1.5 + (rng() - 0.5) * 2)));
      logRows.push({ owner_id: user.id, date, metric_id: `${prefix}sleep_rating`, value: sleepRating, value_text: null });

      const clampedBed = Math.max(1320, Math.min(1410, Math.round(1380 - progress * 20 + (rng() - 0.5) * 60)));
      logRows.push({ owner_id: user.id, date, metric_id: `${prefix}bed_time`, value: clampedBed, value_text: null });

      const readingMins = Math.round(Math.max(15, 25 + progress * 20 + (rng() - 0.5) * 20));
      logRows.push({ owner_id: user.id, date, metric_id: `${prefix}reading`, value: readingMins, value_text: null });
    }

    const { error: logErr } = await supabaseAdmin
      .from("log")
      .upsert(logRows, { onConflict: "owner_id,date,metric_id" });

    if (logErr) {
      console.error("[tour/seed] Log upsert failed:", logErr.code, logErr.message);
      return NextResponse.json({ error: logErr.message, code: logErr.code }, { status: 500 });
    }

    return NextResponse.json({ ok: true, seeded: true });

  } catch (e: any) {
    console.error("[tour/seed] Unhandled exception:", e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
