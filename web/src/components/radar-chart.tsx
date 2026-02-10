"use client";

import {
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type RadarDataPoint = {
  metric: string;
  metric_id: string;
  value: number;
  normalized: number;
  compare_value?: number;
  compare_normalized?: number;
};

export type RadarChartProps = {
  data: RadarDataPoint[];
  showComparison?: boolean;
  primaryLabel?: string;
  compareLabel?: string;
};

export function RadarChart({
  data,
  showComparison = false,
  primaryLabel = "Current",
  compareLabel = "Compare",
}: RadarChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-muted-foreground">
        No data available. Select metrics to compare.
      </div>
    );
  }

  // Transform data for Recharts
  const chartData = data.map((d) => ({
    metric: d.metric,
    value: d.normalized,
    rawValue: d.value,
    compare: d.compare_normalized,
    rawCompare: d.compare_value,
  }));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <RechartsRadarChart data={chartData} cx="50%" cy="50%" outerRadius="80%">
        <PolarGrid />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
        />
        <PolarRadiusAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickCount={5}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const item = payload[0].payload;
            return (
              <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                <div className="font-medium mb-1">{item.metric}</div>
                <div className="text-muted-foreground">
                  {primaryLabel}: <span className="font-mono">{item.rawValue}</span>{" "}
                  <span className="text-xs">({item.value}%)</span>
                </div>
                {showComparison && item.rawCompare !== undefined && (
                  <div className="text-muted-foreground">
                    {compareLabel}: <span className="font-mono">{item.rawCompare}</span>{" "}
                    <span className="text-xs">({item.compare}%)</span>
                  </div>
                )}
              </div>
            );
          }}
        />
        <Radar
          name={primaryLabel}
          dataKey="value"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.5}
          strokeWidth={2}
        />
        {showComparison && (
          <Radar
            name={compareLabel}
            dataKey="compare"
            stroke="#f97316"
            fill="#f97316"
            fillOpacity={0.3}
            strokeWidth={2}
          />
        )}
        {showComparison && <Legend />}
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
