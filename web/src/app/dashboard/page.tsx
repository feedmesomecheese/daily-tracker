"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";

type SummaryRow = {
  metric_id: string;
  type: string;
  n_rows: number | null;
  sum_7d: number | null;
  count_true_7d: number | null;
  avg_7d: number | null;
};

type CheckboxStreakRow = {
  metric_id: string;
  current_streak_true: number;
  longest_streak_true: number;
};

type StatsResponse = {
  checkbox_streaks: CheckboxStreakRow[];
};

function localTodayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10); // YYYY-MM-DD, local
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [streaks, setStreaks] = useState<CheckboxStreakRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = localTodayISO();

  const [authChecked, setAuthChecked] = useState(false);


  useEffect(() => {
    if (!authChecked) return; // wait for auth

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const headers = await getAuthHeaders();
        const today = localTodayISO();

        const [sumRes, statsRes] = await Promise.all([
          fetch(`/api/summary_7d?date=${encodeURIComponent(today)}`, { headers }),
          fetch("/api/stats", { headers }),
        ]);

        const sumJson = await sumRes.json().catch(() => null);
        const statsJson = await statsRes.json().catch(() => null);

        if (!sumRes.ok) {
          console.error("summary error:", sumJson);
          throw new Error(sumJson?.error || `Summary HTTP ${sumRes.status}`);
        }

        if (!statsRes.ok) {
          console.error("stats error:", statsJson);
          throw new Error(statsJson?.error || `Stats HTTP ${statsRes.status}`);
        }

        setSummary((sumJson as SummaryRow[]) ?? []);
        setStreaks((statsJson as StatsResponse)?.checkbox_streaks ?? []);
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [authChecked]);


  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/ping", { headers });

        if (res.ok) {
          setAuthChecked(true);
        } else {
          // Not logged in → send to login
          window.location.href = "/login";
        }
      } catch {
        window.location.href = "/login";
      }
    })();
  }, []);


  

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {error && (
        <div className="text-sm text-red-600 border border-red-200 rounded px-3 py-2">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : (
        <>
          {/* 7-day summary section */}
          <section className="border rounded p-3">
            <div className="font-medium mb-2">7-day Summary (today: {today})</div>
            {!summary || summary.length === 0 ? (
              <div className="text-sm text-gray-600">No data yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1 pr-2">metric_id</th>
                    <th className="py-1 pr-2">type</th>
                    <th className="py-1 pr-2">n_rows</th>
                    <th className="py-1 pr-2">sum_7d</th>
                    <th className="py-1 pr-2">count_true_7d</th>
                    <th className="py-1 pr-2">avg_7d</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.metric_id} className="border-b last:border-b-0">
                      <td className="py-1 pr-2 font-mono text-xs">
                        {row.metric_id}
                      </td>
                      <td className="py-1 pr-2">{row.type}</td>
                      <td className="py-1 pr-2">{row.n_rows ?? ""}</td>
                      <td className="py-1 pr-2">{row.sum_7d ?? ""}</td>
                      <td className="py-1 pr-2">{row.count_true_7d ?? ""}</td>
                      <td className="py-1 pr-2">
                        {row.avg_7d != null ? row.avg_7d.toFixed(3) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Checkbox streaks section */}
          <section className="border rounded p-3">
            <div className="font-medium mb-2">Checkbox Streaks</div>
            {!streaks || streaks.length === 0 ? (
              <div className="text-sm text-gray-600">
                No streak data yet for checkbox metrics.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1 pr-2">metric_id</th>
                    <th className="py-1 pr-2">Current ✓ streak</th>
                    <th className="py-1 pr-2">Longest ✓ streak</th>
                  </tr>
                </thead>
                <tbody>
                  {streaks.map((s) => (
                    <tr key={s.metric_id} className="border-b last:border-b-0">
                      <td className="py-1 pr-2 font-mono text-xs">{s.metric_id}</td>
                      <td className="py-1 pr-2">{s.current_streak_true}</td>
                      <td className="py-1 pr-2">{s.longest_streak_true}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
