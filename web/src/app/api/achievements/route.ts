import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type AchievementDef = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tier: number;
  threshold: number | null;
};

type EarnedAchievement = {
  id: string;
  achievement_id: string;
  metric_id: string | null;
  earned_at: string;
  value: Record<string, unknown> | null;
  notified: boolean;
};

type ConfigEntry = {
  metric_id: string;
  metric_name: string;
};

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const unnotifiedOnly = url.searchParams.get("unnotified") === "1";

  // Get all achievement definitions
  const { data: definitions, error: defError } = await supabase
    .from("achievements")
    .select("*")
    .order("tier", { ascending: true })
    .order("category");

  if (defError) {
    return NextResponse.json({ error: defError.message }, { status: 500 });
  }

  // Get user's earned achievements
  let query = supabase
    .from("user_achievements")
    .select("*")
    .eq("owner_id", user.id)
    .order("earned_at", { ascending: false });

  if (unnotifiedOnly) {
    query = query.eq("notified", false);
  }

  const { data: earned, error: earnedError } = await query;

  if (earnedError) {
    return NextResponse.json({ error: earnedError.message }, { status: 500 });
  }

  // Get metric names for context
  const metricIds = Array.from(new Set((earned || []).map((e: { metric_id: string | null }) => e.metric_id).filter(Boolean)));
  let metricNames: Record<string, string> = {};

  if (metricIds.length > 0) {
    const { data: configs } = await supabase
      .from("config")
      .select("metric_id, metric_name")
      .eq("owner_id", user.id)
      .in("metric_id", metricIds);

    metricNames = Object.fromEntries(
      (configs || []).map((c: ConfigEntry) => [c.metric_id, c.metric_name])
    );
  }

  // Merge definitions with earned status
  const achievementMap = new Map<string, AchievementDef>(
    (definitions || []).map((d: AchievementDef) => [d.id, d])
  );

  const earnedMap = new Map<string, EarnedAchievement[]>();
  for (const e of (earned || []) as EarnedAchievement[]) {
    const key = e.metric_id ? `${e.achievement_id}:${e.metric_id}` : e.achievement_id;
    if (!earnedMap.has(key)) {
      earnedMap.set(key, []);
    }
    earnedMap.get(key)!.push(e);
  }

  // Build response with all achievements
  const allAchievements = (definitions || []).map((def: AchievementDef) => ({
    ...def,
    earned: ((earned || []) as EarnedAchievement[])
      .filter((e: EarnedAchievement) => e.achievement_id === def.id)
      .map((e: EarnedAchievement) => ({
        ...e,
        metric_name: e.metric_id ? metricNames[e.metric_id] : null,
      })),
  }));

  // Recent achievements (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentAchievements = ((earned || []) as EarnedAchievement[])
    .filter((e: EarnedAchievement) => new Date(e.earned_at) > thirtyDaysAgo)
    .map((e: EarnedAchievement) => {
      const def = achievementMap.get(e.achievement_id);
      return {
        ...e,
        definition: def,
        metric_name: e.metric_id ? metricNames[e.metric_id] : null,
      };
    });

  // Stats
  const totalEarned = (earned || []).length;
  const totalPossible = (definitions || []).length;
  const tierCounts = ((earned || []) as EarnedAchievement[]).reduce(
    (acc: Record<number, number>, e: EarnedAchievement) => {
      const def = achievementMap.get(e.achievement_id);
      if (def) {
        acc[def.tier] = (acc[def.tier] || 0) + 1;
      }
      return acc;
    },
    {} as Record<number, number>
  );

  return NextResponse.json({
    achievements: allAchievements,
    recent: recentAchievements,
    stats: {
      total_earned: totalEarned,
      total_possible: totalPossible,
      by_tier: tierCounts,
    },
    unnotified: ((earned || []) as EarnedAchievement[]).filter((e: EarnedAchievement) => !e.notified),
  });
}

// Mark achievements as notified
export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { achievement_ids } = body as { achievement_ids: string[] };

  if (!achievement_ids?.length) {
    return NextResponse.json({ error: "No achievement IDs provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_achievements")
    .update({ notified: true })
    .eq("owner_id", user.id)
    .in("id", achievement_ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
