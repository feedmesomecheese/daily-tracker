"use client";
import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type LogRow = { date: string; metric_id: string; value: number | null };
type ConfigRow = {
  metric_id: string;
  metric_name?: string | null;
  type: "number" | "integer" | "checkbox" | "time";
  private?: boolean | null;
  active?: boolean | null;
};

const PAGE_SIZE_OPTIONS = [7, 14, 30, 90] as const;

export default function WideViewPage() {
  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [logRows, setLogRows] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState(1);

  // Date range filter (optional custom range)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Derive distinct dates (most recent first)
  const allDates = useMemo(
    () => Array.from(new Set(logRows.map(r => r.date))).sort().reverse(),
    [logRows]
  );

  // Filter dates by custom range if set
  const filteredDates = useMemo(() => {
    if (!startDate && !endDate) return allDates;
    return allDates.filter(d => {
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [allDates, startDate, endDate]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredDates.length / pageSize);
  const paginatedDates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDates.slice(start, start + pageSize);
  }, [filteredDates, currentPage, pageSize]);

  // Reset to page 1 when filters or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, startDate, endDate]);

  // Metric ids in config order (no sorting - preserves group/order from API)
  const metricIds = useMemo(
    () => config.map(c => c.metric_id),
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
        <div className="text-sm text-gray-600">Loading...</div>
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

  if (allDates.length === 0 || metricIds.length === 0) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Wide View</h1>
        <div className="text-sm text-gray-600">No data yet.</div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-full mx-auto space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Wide View</h1>
          <Badge variant="secondary">{filteredDates.length} days</Badge>
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
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e);
              alert(message);
            }
          }}
        >
          Download CSV
        </Button>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="pageSize" className="text-sm text-muted-foreground">
            Days per page:
          </label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">From:</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-36 h-9"
          />
          <label className="text-sm text-muted-foreground">To:</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-36 h-9"
          />
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Pagination controls */}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            Prev
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums flex items-center gap-1">
            Page
            <Input
              type="number"
              min={1}
              max={totalPages || 1}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (val >= 1 && val <= totalPages) {
                  setCurrentPage(val);
                }
              }}
              onBlur={(e) => {
                // Clamp value on blur if out of range
                const val = parseInt(e.target.value, 10);
                if (isNaN(val) || val < 1) {
                  setCurrentPage(1);
                } else if (val > totalPages) {
                  setCurrentPage(totalPages || 1);
                }
              }}
              className="w-16 h-8 text-center tabular-nums"
            />
            of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Showing {paginatedDates.length} of {filteredDates.length} days. Metrics ordered by group/position.
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[70vh]">
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted border-b">
                  <th className="sticky left-0 z-20 bg-muted p-2 text-left font-semibold border-r shadow-sm">
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
                {paginatedDates.map((d, idx) => (
                  <tr key={d} className={idx % 2 === 0 ? "bg-background" : "bg-muted/50"}>
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
