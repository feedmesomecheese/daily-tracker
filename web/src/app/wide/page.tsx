"use client";
import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";


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


  // Derive distinct dates (most recent first) and metric ids
  const dates = useMemo(
    () => Array.from(new Set(logRows.map(r => r.date))).sort().reverse(),
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Wide View</h1>
          <Badge variant="secondary">{dates.length} days</Badge>
          <Badge variant="outline">{metricIds.length} metrics</Badge>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const headers = await getAuthHeaders();

              const res = await fetch("/api/export/wide.csv", { headers });
              if (!res.ok) {
                let msg = `Export failed (${res.status})`;
                try {
                  const j = await res.json();
                  msg = j?.error || msg;
                } catch {}
                throw new Error(msg);
              }

              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);

              const a = document.createElement("a");
              a.href = url;
              a.download = "daily-tracker-wide.csv";
              document.body.appendChild(a);
              a.click();
              a.remove();

              window.URL.revokeObjectURL(url);
            } catch (e: any) {
              alert(e?.message || String(e));
            }
          }}
        >
          Download CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Scroll horizontally to see all metrics. Most recent dates shown first.
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[70vh]">
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100 border-b">
                  <th className="sticky left-0 z-20 bg-gray-100 p-2 text-left font-semibold border-r shadow-sm">
                    Date
                  </th>
                  {metricIds.map(mid => (
                    <th key={mid} className="p-2 text-left font-semibold border-l whitespace-nowrap">
                      {nameMap.get(mid) ?? mid}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((d, idx) => (
                  <tr key={d} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="sticky left-0 z-10 bg-inherit p-2 border-r font-medium shadow-sm">
                      {d}
                    </td>
                    {metricIds.map(mid => {
                      const key = `${d}|${mid}`;
                      const v = cellMap.get(key);
                      return (
                        <td key={mid} className="p-2 border-l text-right tabular-nums">
                          {v == null ? <span className="text-gray-300">—</span> : v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
