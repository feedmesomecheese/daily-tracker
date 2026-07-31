"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { ChartTooltip } from "@/components/chart-tooltip";

export type TrackerSeries = {
  key: string;
  name: string;
  slot?: 1 | 2 | 3 | 4 | 5 | 6;
  kind?: "area" | "line";
  dashed?: boolean;
};

export type TrackerChartProps = {
  data: Record<string, unknown>[];
  series: TrackerSeries[];
  height?: number;
  goal?: { value: number; label?: string };
  yFormatter?: (v: number) => string;
};

function formatDateTick(d: string) {
  if (typeof d !== "string" || !d.includes("-")) return d;
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

export function TrackerChart({ data, series, height = 240, goal, yFormatter }: TrackerChartProps) {
  const showLegend = series.length >= 2;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height} debounce={500}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <defs>
            {series
              .filter((s) => (s.kind ?? (series.indexOf(s) === 0 ? "area" : "line")) === "area")
              .map((s) => {
                const slot = s.slot ?? 1;
                return (
                  <linearGradient key={s.key} id={`tc-gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`var(--chart-${slot})`} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={`var(--chart-${slot})`} stopOpacity={0} />
                  </linearGradient>
                );
              })}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            tickFormatter={formatDateTick}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            tickFormatter={yFormatter}
            domain={["auto", "auto"]}
          />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(entry) =>
                  `${entry.name}: ${yFormatter ? yFormatter(entry.value) : entry.value}`
                }
              />
            }
          />
          {goal && (
            <ReferenceLine
              y={goal.value}
              stroke="var(--status-good)"
              strokeDasharray="6 4"
              label={{
                value: goal.label ?? `Goal: ${goal.value}`,
                position: "right",
                fontSize: 10,
                fill: "var(--status-good)",
              }}
            />
          )}
          {series.map((s, i) => {
            const slot = s.slot ?? 1;
            const kind = s.kind ?? (i === 0 ? "area" : "line");
            const color = `var(--chart-${slot})`;
            if (kind === "area") {
              return (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#tc-gradient-${s.key})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                  strokeOpacity={s.dashed ? 0.8 : 1}
                />
              );
            }
            return (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                strokeDasharray={s.dashed ? "4 3" : undefined}
                strokeOpacity={s.dashed ? 0.8 : 1}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
          {series.map((s) => {
            const slot = s.slot ?? 1;
            return (
              <span key={s.key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: `var(--chart-${slot})` }}
                />
                {s.name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
