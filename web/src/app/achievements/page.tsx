"use client";

import { useEffect, useState, useMemo } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { AchievementBadge } from "@/components/achievement-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AchievementDefinition = {
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
  metric_name: string | null;
};

type Achievement = AchievementDefinition & {
  earned: EarnedAchievement[];
};

type AchievementsResponse = {
  achievements: Achievement[];
  recent: (EarnedAchievement & { definition: AchievementDefinition })[];
  stats: {
    total_earned: number;
    total_possible: number;
    by_tier: Record<number, number>;
  };
  unnotified: EarnedAchievement[];
};

const CATEGORY_LABELS: Record<string, string> = {
  streak: "Streaks",
  record: "Records",
  consistency: "Consistency",
  milestone: "Milestones",
};

const CATEGORY_ICONS: Record<string, string> = {
  streak: "🔥",
  record: "🏆",
  consistency: "⭐",
  milestone: "🎯",
};

export default function AchievementsPage() {
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const headers = await getAuthHeaders();
        const res = await fetch("/api/achievements", { headers });
        const result = await res.json();

        if (!res.ok) throw new Error(result?.error || "Failed to load achievements");

        setData(result);

        // Mark unnotified as notified
        if (result.unnotified?.length > 0) {
          const ids = result.unnotified.map((a: EarnedAchievement) => a.id);
          fetch("/api/achievements", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ achievement_ids: ids }),
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group achievements by category
  const groupedAchievements = useMemo(() => {
    if (!data) return new Map();

    const groups = new Map<string, Achievement[]>();
    for (const a of data.achievements) {
      const existing = groups.get(a.category) || [];
      existing.push(a);
      groups.set(a.category, existing);
    }
    return groups;
  }, [data]);

  // Filter based on active tab
  const filteredAchievements = useMemo(() => {
    if (!data) return [];

    if (activeTab === "all") {
      return data.achievements;
    }

    if (activeTab === "earned") {
      return data.achievements.filter((a) => a.earned.length > 0);
    }

    if (activeTab === "unearned") {
      return data.achievements.filter((a) => a.earned.length === 0);
    }

    // Category filter
    return data.achievements.filter((a) => a.category === activeTab);
  }, [data, activeTab]);

  if (loading) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Achievements</h1>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Achievements</h1>
        <div className="text-sm text-red-600">Error: {error}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Achievements</h1>
        <div className="text-sm text-muted-foreground">No data available.</div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Achievements</h1>
          <Badge variant="secondary">
            {data.stats.total_earned} / {data.stats.total_possible}
          </Badge>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((tier) => (
          <Card key={tier}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold font-mono">
                {data.stats.by_tier[tier] || 0}
              </div>
              <div className="text-xs text-muted-foreground">Tier {tier}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent achievements */}
      {data.recent.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Recent Achievements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.recent.slice(0, 5).map((earned) => (
                <div
                  key={earned.id}
                  className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg"
                >
                  <span className="text-xl">{earned.definition?.icon}</span>
                  <div>
                    <div className="font-medium text-sm">{earned.definition?.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {earned.metric_name && `${earned.metric_name} • `}
                      {new Date(earned.earned_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="earned">Earned</TabsTrigger>
          <TabsTrigger value="unearned">Locked</TabsTrigger>
          {Array.from(groupedAchievements.keys()).map((category) => (
            <TabsTrigger key={category} value={category}>
              {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category] || category}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {/* Group by category when showing all */}
          {activeTab === "all" ? (
            <div className="space-y-6">
              {Array.from(groupedAchievements.entries()).map(([category, achievements]) => (
                <div key={category}>
                  <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span>{CATEGORY_ICONS[category]}</span>
                    {CATEGORY_LABELS[category] || category}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {achievements.map((a) => (
                      <AchievementBadge
                        key={a.id}
                        icon={a.icon}
                        name={a.name}
                        description={a.description}
                        tier={a.tier}
                        earned={a.earned.length > 0}
                        earnedAt={a.earned[0]?.earned_at}
                        metricName={a.earned[0]?.metric_name}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredAchievements.map((a) => (
                <AchievementBadge
                  key={a.id}
                  icon={a.icon}
                  name={a.name}
                  description={a.description}
                  tier={a.tier}
                  earned={a.earned.length > 0}
                  earnedAt={a.earned[0]?.earned_at}
                  metricName={a.earned[0]?.metric_name}
                />
              ))}
              {filteredAchievements.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-8">
                  No achievements in this category.
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
