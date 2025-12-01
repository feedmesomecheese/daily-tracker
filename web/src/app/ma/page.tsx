"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type ConfigRow = {
  metric_id: string;
  metric_name?: string | null;
  type: "number" | "integer" | "checkbox" | "time" | "hhmm";
  show_ma?: boolean | null;
  ma_periods_csv?: string | null;
  private?: boolean | null;
  active?: boolean | null;
};

type MaRow = {
  metric_id: string;
  period: number;
  date: string;
  ma_value: number | null;
};

type RawRow = {
  date: string;
  value: number | null;
};

type MaApiResponse = {
  ma: MaRow[];
  raw: RawRow[];
};

export default function MaPage() {
  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [metricId, setMetricId] = useState<string>("");
  const [period, setPeriod] = useState<number>(7);
  const [maSeries, setMaSeries] = useState<MaRow[]>([]);
  const [rawSeries, setRawSeries] = useState<RawRow[]>([]);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [loadingMa, setLoadingMa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load metrics config
  useEffect(() => {
    (async () => {
      try {
        setLoadingCfg(true);
        setError(null);
        const headers = await getAuthHeaders();
        const res = await fetch("/api/config", { headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load config");

        const visible: ConfigRow[] = data.filter(
          (c: ConfigRow) =>
            (c.active ?? true) &&
            (c.show_ma ?? false)
        );

        setConfig(visible);

        if (visible.length > 0) {
          setMetricId(visible[0].metric_id);
          const periods = parsePeriods(visible[0].ma_periods_csv);
          if (periods.length > 0) {
            setPeriod(periods[0]);
          }
        }
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoadingCfg(false);
      }
    })();
  }, []);

  const currentMetric = useMemo(
    () => config.find((c) => c.metric_id === metricId) || null,
    [config, metricId]
  );

  const periodsForMetric = useMemo(
    () => parsePeriods(currentMetric?.ma_periods_csv),
    [currentMetric]
  );

  async function refreshMa() {
    if (!metricId || !period) return;
    try {
      setLoadingMa(true);
      setError(null);
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        metric_id: metricId,
        period: String(period),
      });
      const res = await fetch(`/api/ma?${params.toString()}`, { headers });
      const data: MaApiResponse = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || "Failed to load MA");

      setMaSeries(data.ma ?? []);
      setRawSeries(data.raw ?? []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoadingMa(false);
    }
  }

  // Combine raw + MA into chart data (by date)
  const chartData = useMemo(() => {
    if (!maSeries.length && !rawSeries.length) return [];

    const rawByDate = new Map<string, number | null>();
    for (const r of rawSeries) {
      rawByDate.set(r.date, r.value);
    }

    // Use MA dates as the spine; you could also union with raw dates if you want
    return maSeries.map((m) => ({
      date: m.date,
      ma: m.ma_value,
      raw: rawByDate.get(m.date) ?? null,
    }));
  }, [maSeries, rawSeries]);

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Moving Averages</h1>

      {loadingCfg && <div className="text-sm text-gray-600">Loading metrics…</div>}
      {error && <div className="text-sm text-red-600">Error: {error}</div>}

      {!loadingCfg && config.length === 0 && (
        <div className="text-sm text-gray-600">
          No metrics are configured for moving averages (show_ma = TRUE).
        </div>
      )}

      {!loadingCfg && config.length > 0 && (
        <div className="space-y-3 border rounded p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div>
              <label className="block text-xs mb-1">Metric</label>
              <select
                className="border rounded px-2 py-1 text-sm min-w-[200px]"
                value={metricId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setMetricId(nextId);
                  const nextCfg =
                    config.find((c) => c.metric_id === nextId) || null;
                  const periods = parsePeriods(nextCfg?.ma_periods_csv);
                  if (periods.length > 0) {
                    setPeriod(periods[0]);
                  }
                  // Clear previous series when switching metric
                  setMaSeries([]);
                  setRawSeries([]);
                }}
              >
                {config.map((m) => (
                  <option key={m.metric_id} value={m.metric_id}>
                    {m.metric_name || m.metric_id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Period (days)</label>
              <select
                className="border rounded px-2 py-1 text-sm min-w-[80px]"
                value={period}
                onChange={(e) => setPeriod(parseInt(e.target.value, 10))}
              >
                {periodsForMetric.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="px-3 py-1 rounded border text-sm disabled:opacity-50"
              onClick={refreshMa}
              disabled={loadingMa || !metricId || !period}
            >
              {loadingMa ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Pick a metric + period and click &ldquo;Refresh&rdquo; to see the moving
            average over time.
          </p>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            {currentMetric?.metric_name || currentMetric?.metric_id} – {period}-day MA
          </h2>
            <div
              className="border rounded p-3"
              style={{ width: "100%", height: 320 }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="raw"
                    name="Raw"
                    dot={false}
                    strokeWidth={1}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="ma"
                    name={`${period}-day MA`}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
        </section>
      )}

      {/* MA Table */}
      {maSeries.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Raw values &amp; {period}-day MA (table)
          </h2>
          <div className="max-h-80 overflow-auto border rounded">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-1 text-left">Date</th>
                  <th className="p-1 text-right">Raw</th>
                  <th className="p-1 text-right">{period}-day MA</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => (
                  <tr key={row.date} className="border-b">
                    <td className="p-1">{row.date}</td>
                    <td className="p-1 text-right">
                      {row.raw == null ? "—" : row.raw.toFixed(2)}
                    </td>
                    <td className="p-1 text-right">
                      {row.ma == null ? "—" : row.ma.toFixed(2)}
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

function parsePeriods(csv: string | null | undefined): number[] {
  if (!csv) return [7, 30, 90, 365];
  return csv
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}
