"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";

type CheckboxLifetimeRow = {
  metric_id: string;
  metric_name: string | null;
  private: boolean | null;
  active: boolean | null;
  first_date: string | null;
  last_date: string | null;
  days_on_record: number | null;
  days_tracked: number | null;
  total_true: number | null;
  total_false: number | null;
  pct_true_lifetime: number | null;
  avg_days_between_true: number | null;
};

type CheckboxStreakRow = {
  metric_id: string;
  metric_name: string | null;
  private: boolean | null;
  active: boolean | null;
  current_streak_true: number;
  current_streak_false: number;
  longest_streak_true: number;
  longest_streak_false: number;
  last_true_date: string | null;
  days_since_last_true: number | null;
};

type NumericLifetimeRow = {
  metric_id: string;
  metric_name: string | null;
  private: boolean | null;
  active: boolean | null;
  first_date: string | null;
  last_date: string | null;
  days_on_record: number | null;
  days_tracked: number | null;
  value_count: number | null;
  avg_value: number | null;
  stddev_value: number | null;
  min_value: number | null;
  min_value_date: string | null;
  max_value: number | null;
  max_value_date: string | null;
};

type NumericRecentRow = {
  metric_id: string;
  metric_name: string | null;
  private: boolean | null;
  active: boolean | null;
  window_days: number;
  days_tracked_recent: number | null;
  value_count_recent: number | null;
  avg_value_recent: number | null;
  first_date_recent: string | null;
  last_date_recent: string | null;
};


type StatsResponse = {
  checkbox_lifetime: CheckboxLifetimeRow[];
  checkbox_streaks: CheckboxStreakRow[];
  numeric_lifetime: NumericLifetimeRow[];
  numeric_recent: NumericRecentRow[];
};

export default function StatsPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showPrivate, setShowPrivate] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const headers = await getAuthHeaders();
        const res = await fetch("/api/stats", { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load stats");
        setData(json);
      } catch (e: any) {
        setErr(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const checkboxLifetime = (data?.checkbox_lifetime ?? []).filter((row) =>
    showPrivate ? true : !row.private
  );

  const checkboxStreaks = (data?.checkbox_streaks ?? []).filter((row) =>
    showPrivate ? true : !row.private
  );

  const numericLifetime = (data?.numeric_lifetime ?? []).filter((row) =>
    showPrivate ? true : !row.private
  );

  const numericRecent = (data?.numeric_recent ?? []).filter((row) =>
    showPrivate ? true : !row.private
  );


  return (
    <main className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Stats &amp; Streaks</h1>

      <div className="flex items-center gap-3 text-sm text-gray-700">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="border rounded"
            checked={showPrivate}
            onChange={(e) => setShowPrivate(e.target.checked)}
          />
          <span>Show private metrics</span>
        </label>
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600">Error: {err}</div>}

      {!loading && checkboxLifetime.length === 0 && (
        <div className="text-sm text-gray-600">
          No checkbox stats yet. Make sure you have checkbox metrics with data.
        </div>
      )}
      
      {!loading && checkboxLifetime.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Checkbox – Lifetime Stats</h2>
          <div className="overflow-auto border rounded">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2 text-left">Metric</th>
                  <th className="p-2 text-center">Active</th>
                  <th className="p-2 text-left">First date</th>
                  <th className="p-2 text-left">Last date</th>
                  <th className="p-2 text-right">Days on record</th>
                  <th className="p-2 text-right">Days tracked</th>
                  <th className="p-2 text-right">Total true</th>
                  <th className="p-2 text-right">Total false</th>
                  <th className="p-2 text-right">% true (lifetime)</th>
                  <th className="p-2 text-right">Avg days between true</th>
                </tr>
              </thead>
              <tbody>
                {checkboxLifetime.map((row) => (
                  <tr key={row.metric_id} className="border-b">
                    <td className="p-2">
                      {row.metric_name || row.metric_id}
                      {row.private ? (
                        <span className="ml-1 text-[10px] px-1 py-0.5 border rounded text-gray-500">
                          private
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2 text-center">
                      {(row.active ?? true) ? "yes" : "no"}
                    </td>
                    <td className="p-2">{row.first_date ?? "—"}</td>
                    <td className="p-2">{row.last_date ?? "—"}</td>
                    <td className="p-2 text-right">
                      {row.days_on_record ?? "—"}
                    </td>
                    <td className="p-2 text-right">
                      {row.days_tracked ?? "—"}
                    </td>
                    <td className="p-2 text-right">
                      {row.total_true ?? 0}
                    </td>
                    <td className="p-2 text-right">
                      {row.total_false ?? 0}
                    </td>
                    <td className="p-2 text-right">
                      {row.pct_true_lifetime == null
                        ? "—"
                        : (row.pct_true_lifetime * 100).toFixed(1) + "%"}
                    </td>
                    <td className="p-2 text-right">
                      {row.avg_days_between_true == null
                        ? "—"
                        : row.avg_days_between_true.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      
      {!loading && checkboxStreaks.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Checkbox – Streaks</h2>
          <div className="overflow-auto border rounded">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2 text-left">Metric</th>
                  <th className="p-2 text-right">Current True</th>
                  <th className="p-2 text-right">Longest True</th>
                  <th className="p-2 text-right">Current False</th>
                  <th className="p-2 text-right">Longest False</th>
                  <th className="p-2 text-left">Last True Date</th>
                  <th className="p-2 text-right">Days Since Last True</th>
                </tr>
              </thead>
              <tbody>
                {checkboxStreaks.map((row) => (
                  <tr key={row.metric_id} className="border-b">
                    <td className="p-2">
                      {row.metric_name || row.metric_id}
                      {row.private ? (
                        <span className="ml-1 text-[10px] px-1 py-0.5 border rounded text-gray-500">
                          private
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2 text-right">{row.current_streak_true}</td>
                    <td className="p-2 text-right">{row.longest_streak_true}</td>
                    <td className="p-2 text-right">{row.current_streak_false}</td>
                    <td className="p-2 text-right">{row.longest_streak_false}</td>
                    <td className="p-2">{row.last_true_date ?? "—"}</td>
                    <td className="p-2 text-right">
                      {row.days_since_last_true ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && numericLifetime.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Numeric – Lifetime Stats</h2>
          <div className="overflow-auto border rounded">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2 text-left">Metric</th>
                  <th className="p-2 text-center">Active</th>
                  <th className="p-2 text-left">First date</th>
                  <th className="p-2 text-left">Last date</th>
                  <th className="p-2 text-right">Days on record</th>
                  <th className="p-2 text-right">Days tracked</th>
                  <th className="p-2 text-right">Values</th>
                  <th className="p-2 text-right">Avg</th>
                  <th className="p-2 text-right">Std dev</th>
                  <th className="p-2 text-right">Min</th>
                  <th className="p-2 text-left">Min date</th>
                  <th className="p-2 text-right">Max</th>
                  <th className="p-2 text-left">Max date</th>
                </tr>
              </thead>
              <tbody>
                {numericLifetime.map((row) => (
                  <tr key={row.metric_id} className="border-b">
                    <td className="p-2">
                      {row.metric_name || row.metric_id}
                      {row.private ? (
                        <span className="ml-1 text-[10px] px-1 py-0.5 border rounded text-gray-500">
                          private
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2 text-center">
                      {(row.active ?? true) ? "yes" : "no"}
                    </td>
                    <td className="p-2">{row.first_date ?? "—"}</td>
                    <td className="p-2">{row.last_date ?? "—"}</td>
                    <td className="p-2 text-right">
                      {row.days_on_record ?? "—"}
                    </td>
                    <td className="p-2 text-right">
                      {row.days_tracked ?? "—"}
                    </td>
                    <td className="p-2 text-right">
                      {row.value_count ?? "—"}
                    </td>
                    <td className="p-2 text-right">
                      {row.avg_value == null
                        ? "—"
                        : row.avg_value.toFixed(2)}
                    </td>
                    <td className="p-2 text-right">
                      {row.stddev_value == null
                        ? "—"
                        : row.stddev_value.toFixed(2)}
                    </td>
                    <td className="p-2 text-right">
                      {row.min_value == null
                        ? "—"
                        : row.min_value.toFixed(2)}
                    </td>
                    <td className="p-2">
                      {row.min_value_date ?? "—"}
                    </td>
                    <td className="p-2 text-right">
                      {row.max_value == null
                        ? "—"
                        : row.max_value.toFixed(2)}
                    </td>
                    <td className="p-2">
                      {row.max_value_date ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && numericRecent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Numeric – Recent Windows</h2>
          <div className="overflow-auto border rounded">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2 text-left">Metric</th>
                  <th className="p-2 text-center">Active</th>
                  <th className="p-2 text-right">Window (days)</th>
                  <th className="p-2 text-right">Days tracked</th>
                  <th className="p-2 text-right">Values</th>
                  <th className="p-2 text-right">Avg (window)</th>
                  <th className="p-2 text-left">First in window</th>
                  <th className="p-2 text-left">Last in window</th>
                </tr>
              </thead>
              <tbody>
                {numericRecent.map((row) => (
                  <tr
                    key={`${row.metric_id}-${row.window_days}`}
                    className="border-b"
                  >
                    <td className="p-2">
                      {row.metric_name || row.metric_id}
                      {row.private ? (
                        <span className="ml-1 text-[10px] px-1 py-0.5 border rounded text-gray-500">
                          private
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2 text-center">
                      {(row.active ?? true) ? "yes" : "no"}
                    </td>
                    <td className="p-2 text-right">{row.window_days}</td>
                    <td className="p-2 text-right">
                      {row.days_tracked_recent ?? "—"}
                    </td>
                    <td className="p-2 text-right">
                      {row.value_count_recent ?? "—"}
                    </td>
                    <td className="p-2 text-right">
                      {row.avg_value_recent == null
                        ? "—"
                        : row.avg_value_recent.toFixed(2)}
                    </td>
                    <td className="p-2">
                      {row.first_date_recent ?? "—"}
                    </td>
                    <td className="p-2">
                      {row.last_date_recent ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </main>
  );
}
