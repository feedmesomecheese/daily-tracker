"use client";
import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";


type LogRow = { date: string; metric_id: string; value: number | null };
type ConfigRow = {
  metric_id: string;
  metric_name?: string | null;
  type: "number" | "integer" | "checkbox" | "time";
  private?: boolean | null;
  active?: boolean | null;
};

export default function WideViewPage() {
  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [logRows, setLogRows] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const headers = await getAuthHeaders();

        const [cfgRes, logRes] = await Promise.all([
          fetch("/api/config", { headers }),
          fetch("/api/log", { headers }),
        ]);

        const [cfgData, logData] = await Promise.all([cfgRes.json(), logRes.json()]);

        if (!cfgRes.ok) throw new Error(cfgData?.error || "Failed to load config");
        if (!logRes.ok) throw new Error(logData?.error || "Failed to load log");

        const cfgVisible: ConfigRow[] = cfgData.filter(
          (c: ConfigRow) => !c.private && (c.active ?? true)
        );
        setConfig(cfgVisible);
        setLogRows(logData);
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);


  // Derive distinct dates and metric ids
  const dates = useMemo(
    () => Array.from(new Set(logRows.map(r => r.date))).sort(),
    [logRows]
  );
  const metricIds = useMemo(
    () =>
      config.map(c => c.metric_id).sort(),
    [config]
  );

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    config.forEach(c => {
      m.set(c.metric_id, c.metric_name || c.metric_id);
    });
    return m;
  }, [config]);

  // Build a lookup: key = date|metric_id → value
  const cellMap = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of logRows) {
      m.set(`${r.date}|${r.metric_id}`, r.value);
    }
    return m;
  }, [logRows]);

  if (loading) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Wide View</h1>
        <div className="text-sm text-gray-600">Loading…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Wide View</h1>
        <div className="text-sm text-red-600">Error: {error}</div>
      </main>
    );
  }

  if (dates.length === 0 || metricIds.length === 0) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Wide View</h1>
        <div className="text-sm text-gray-600">No data yet.</div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-full mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Wide View (All Metrics)</h1>
      <div className="text-xs text-gray-600">
        Scroll horizontally to see all metrics. This is a read-only inspection view for now.
      </div>
      <div className="overflow-auto border rounded">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="sticky left-0 bg-gray-50 p-1 text-left">date</th>
              {metricIds.map(mid => (
                <th key={mid} className="p-1 text-left border-l">
                  {nameMap.get(mid) ?? mid}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map(d => (
              <tr key={d} className="border-b">
                <td className="sticky left-0 bg-white p-1 border-r font-medium">{d}</td>
                {metricIds.map(mid => {
                  const key = `${d}|${mid}`;
                  const v = cellMap.get(key);
                  return (
                    <td key={mid} className="p-1 border-l text-right">
                      {v == null ? "" : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
