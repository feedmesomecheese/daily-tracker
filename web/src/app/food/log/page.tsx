"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authHeaders";
import { useToast } from "@/components/ui/Toast";
import { addDays } from "@/lib/dateUtils";

interface FoodGoal {
  nutrient: string;
  direction: "min" | "max" | "target";
  value: number;
  value_type: "absolute" | "per_lb_bodyweight" | "pct_calories";
  is_active: boolean;
}
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

interface FoodLog {
  id: string;
  date: string;
  notes: string | null;
  is_submitted: boolean;
  submitted_at: string | null;
  is_fasted: boolean;
  total_calories: number;
  total_protein: number;
  total_fat: number;
  total_carbs: number;
  total_fiber: number;
}

interface RollingAverages {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Unknown date";
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function computeRollingAverages(logs: FoodLog[], days: number = 7): RollingAverages {
  if (logs.length === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 };

  const logByDate = new Map(logs.map((l) => [l.date, l]));
  const endDate = todayISO();

  type MacroDay = { calories: number; protein: number; carbs: number; fat: number };
  const filled: MacroDay[] = [];
  let lastKnown: MacroDay | null = null;

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const log = logByDate.get(date);
    if (log && !log.is_fasted && log.total_calories > 0) {
      lastKnown = {
        calories: log.total_calories,
        protein: log.total_protein,
        carbs: log.total_carbs,
        fat: log.total_fat,
      };
      filled.push(lastKnown);
    } else if (!log?.is_fasted && lastKnown) {
      filled.push(lastKnown); // carry forward empty/missing days (skip fasted entirely)
    }
  }

  if (filled.length === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 };

  const sum = filled.reduce(
    (acc, d) => ({
      calories: acc.calories + d.calories,
      protein: acc.protein + d.protein,
      carbs: acc.carbs + d.carbs,
      fat: acc.fat + d.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  return {
    calories: Math.round(sum.calories / filled.length),
    protein: Math.round(sum.protein / filled.length),
    carbs: Math.round(sum.carbs / filled.length),
    fat: Math.round(sum.fat / filled.length),
  };
}

type ChartDayType = "actual" | "carried" | "fasted";

interface ChartDay {
  label: string;
  date: string;
  Protein: number;
  Carbs: number;
  Fat: number;
  Calories: number;
  dayType: ChartDayType;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildChartData(logs: FoodLog[], days: number = 30): ChartDay[] {
  if (logs.length === 0) return [];

  const logByDate = new Map(logs.map((l) => [l.date, l]));
  // Always extend chart window to today so recent un-logged days show carry-forward
  const endDate = todayISO();

  const result: ChartDay[] = [];
  let lastKnown: { Protein: number; Carbs: number; Fat: number; Calories: number } | null = null;

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const log = logByDate.get(date);
    const [, month, day] = date.split("-");
    const label = `${Number(month)}/${Number(day)}`;

    if (log && log.is_fasted) {
      result.push({ label, date, Protein: 0, Carbs: 0, Fat: 0, Calories: 0, dayType: "fasted" });
    } else if (log && log.total_calories > 0) {
      lastKnown = {
        Protein: Math.round(log.total_protein),
        Carbs: Math.round(log.total_carbs),
        Fat: Math.round(log.total_fat),
        Calories: Math.round(log.total_calories),
      };
      result.push({ label, date, ...lastKnown, dayType: "actual" });
    } else if (lastKnown) {
      // empty log (0 cal) or no log: carry forward last known data
      result.push({ label, date, ...lastKnown, dayType: "carried" });
    }
    // Days before any logged data: omit
  }

  return result;
}

const PAGE_SIZE = 30;

// Tooltip for the stacked macro chart
function MacroTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const calories = payload.find((p) => p.name === "Calories");
  const macros = payload.filter((p) => p.name !== "Calories");
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow text-xs">
      <p className="font-medium mb-1">{label}</p>
      {calories && <p className="font-medium">{Math.round(calories.value)} kcal</p>}
      {macros.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {Math.round(p.value)}g</p>
      ))}
    </div>
  );
}

function goalMet(value: number, goal: FoodGoal): boolean {
  if (goal.value_type !== "absolute") return false; // skip non-absolute for history
  if (goal.direction === "min") return value >= goal.value;
  if (goal.direction === "max") return value <= goal.value;
  return Math.abs(value - goal.value) / goal.value <= 0.1;
}

export default function FoodLogPage() {
  const router = useRouter();
  const { toast, confirm } = useToast();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [goals, setGoals] = useState<FoodGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [chartDays, setChartDays] = useState<7 | 30 | 90>(30);

  const fetchLogs = useCallback(async (currentOffset: number, append: boolean = false) => {
    try {
      setError(null);
      if (!append) setLoading(true);
      else setLoadingMore(true);

      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      });
      const res = await fetch(`/api/food/logs?${params}`, { headers });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Failed to load food logs");
      }

      const fetched: FoodLog[] = json.logs ?? json ?? [];
      setHasMore(fetched.length >= PAGE_SIZE);

      if (append) {
        setLogs((prev) => [...prev, ...fetched]);
      } else {
        setLogs(fetched);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load food logs");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(0, false);
    // Fetch goals once (fire and forget)
    getAuthHeaders().then((headers) =>
      fetch("/api/food/goals", { headers })
        .then((r) => r.json())
        .then((data) => {
          const g: FoodGoal[] = Array.isArray(data) ? data : (data.goals ?? []);
          setGoals(g.filter((goal) => goal.is_active));
        })
        .catch(() => {/* ignore */})
    );
  }, [fetchLogs]);

  const loadMore = async () => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    await fetchLogs(nextOffset, true);
  };

  const avg = computeRollingAverages(logs, 7);
  const hasMeaningfulAvg = logs.length > 0;

  const chartData = buildChartData(logs, chartDays);

  // Goal adherence: count logged (non-fasted, >0 cal) days where all absolute goals are met
  const absGoals = goals.filter((g) => g.value_type === "absolute");
  const loggedDays = logs.filter((l) => !l.is_fasted && l.total_calories > 0);
  const goalAdherence = absGoals.length > 0
    ? {
        met: loggedDays.filter((l) => {
          const vals: Record<string, number> = {
            calories: l.total_calories, protein: l.total_protein,
            carbs: l.total_carbs, fat: l.total_fat, fiber: l.total_fiber,
          };
          return absGoals.every((g) => goalMet(vals[g.nutrient] ?? 0, g));
        }).length,
        total: loggedDays.length,
      }
    : null;

  const handleDeleteAllHistory = async () => {
    if (!await confirm({ message: "DEV: Delete ALL food history? This cannot be undone.", destructive: true, confirmLabel: "Delete All" })) return;
    setDeletingAll(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/food/logs", { method: "DELETE", headers });
      if (!res.ok) throw new Error("Failed to delete");
      setLogs([]);
      setOffset(0);
      setHasMore(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Food History</h1>
        <button
          onClick={handleDeleteAllHistory}
          disabled={deletingAll}
          className="text-xs px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          title="Dev: clear all food history"
        >
          {deletingAll ? "Deleting..." : "DEV: Clear History"}
        </button>
      </div>

      {/* Rolling averages card */}
      {hasMeaningfulAvg && (
        <div className="bg-card border rounded-lg p-4 mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-medium mb-2 text-muted-foreground">
                7-Day Average (carry-forward)
              </h2>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="font-medium">{avg.calories} kcal</span>
                <span className="text-green-500">{avg.protein}g protein</span>
                <span className="text-amber-400">{avg.carbs}g carbs</span>
                <span className="text-blue-400">{avg.fat}g fat</span>
              </div>
            </div>
            {goalAdherence && goalAdherence.total > 0 && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Goals met</p>
                <p className="text-sm font-semibold">
                  <span className={goalAdherence.met === goalAdherence.total ? "text-green-500" : goalAdherence.met / goalAdherence.total >= 0.7 ? "text-amber-500" : "text-red-500"}>
                    {goalAdherence.met}
                  </span>
                  <span className="text-muted-foreground">/{goalAdherence.total}</span>
                  <span className="text-xs text-muted-foreground ml-1">days</span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Macro trend chart */}
      {chartData.length >= 2 && (
        <div className="bg-card border rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">Macro Trend</h2>
            <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setChartDays(d)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    chartDays === d
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis yAxisId="macro" tick={{ fontSize: 10 }} unit="g" />
                <YAxis yAxisId="cal" orientation="right" tick={{ fontSize: 10 }} unit="k" tickFormatter={(v) => `${Math.round(v / 1000)}`} />
                <Tooltip content={<MacroTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="macro" dataKey="Protein" stackId="macros" fill="#22c55e" isAnimationActive={false}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fillOpacity={entry.dayType === "actual" ? 0.85 : entry.dayType === "carried" ? 0.5 : 0.12} />
                  ))}
                </Bar>
                <Bar yAxisId="macro" dataKey="Carbs" stackId="macros" fill="#f59e0b" isAnimationActive={false}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fillOpacity={entry.dayType === "actual" ? 0.85 : entry.dayType === "carried" ? 0.5 : 0.12} />
                  ))}
                </Bar>
                <Bar yAxisId="macro" dataKey="Fat" stackId="macros" fill="#60a5fa" isAnimationActive={false}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fillOpacity={entry.dayType === "actual" ? 0.85 : entry.dayType === "carried" ? 0.5 : 0.12} />
                  ))}
                </Bar>
                <Line yAxisId="cal" type="monotone" dataKey="Calories" stroke="#e11d48" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-card border rounded-lg p-4 h-[72px] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && logs.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No food logs yet</p>
          <button
            onClick={() => router.push("/food")}
            className="mt-4 px-4 py-2 border rounded-lg text-sm hover:bg-accent transition-colors"
          >
            Log today&apos;s food
          </button>
        </div>
      )}

      {/* Log list */}
      {!loading && logs.length > 0 && (
        <div className="space-y-2">
          {logs.filter((log) => log.date).map((log) => (
            <button
              key={log.id}
              onClick={() => router.push(`/food?date=${log.date}`)}
              className="w-full text-left bg-card border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{formatDate(log.date)}</span>
                <div className="flex items-center gap-2">
                  {log.is_fasted ? (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      Fasted
                    </span>
                  ) : log.total_calories === 0 ? (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      No log
                    </span>
                  ) : goals.length > 0 ? (() => {
                    const vals: Record<string, number> = {
                      calories: log.total_calories,
                      protein: log.total_protein,
                      carbs: log.total_carbs,
                      fat: log.total_fat,
                      fiber: log.total_fiber,
                    };
                    const relevant = goals.filter((g) => g.value_type === "absolute" && vals[g.nutrient] !== undefined);
                    if (relevant.length === 0) return null;
                    const allMet = relevant.every((g) => goalMet(vals[g.nutrient], g));
                    const anyOver = relevant.some((g) => g.direction === "max" && vals[g.nutrient] > g.value);
                    return (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${allMet ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : anyOver ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}`}>
                        {allMet ? "✓ Goals" : anyOver ? "Over" : "Partial"}
                      </span>
                    );
                  })() : null}
                  {log.is_submitted && (
                    <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full">
                      Submitted
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                <span>{Math.round(log.total_calories)} kcal</span>
                <span className="text-green-500">{Math.round(log.total_protein)}g P</span>
                <span className="text-amber-400">{Math.round(log.total_carbs)}g C</span>
                <span className="text-blue-400">{Math.round(log.total_fat)}g F</span>
                {log.total_fiber > 0 && (
                  <span>{Math.round(log.total_fiber)}g fiber</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 border rounded-lg text-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </main>
  );
}
