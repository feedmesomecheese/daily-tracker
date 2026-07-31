"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTileDelta = {
  text: string;
  direction: "up" | "down" | "flat";
  good?: boolean;
};

export type StatTileProps = {
  label: string;
  value: string;
  delta?: StatTileDelta;
  spark?: number[];
  onClick?: () => void;
  className?: string;
};

const ARROWS: Record<StatTileDelta["direction"], string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

function Sparkline({ values }: { values: number[] }) {
  const width = 40;
  const height = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatTile({ label, value, delta, spark, onClick, className }: StatTileProps) {
  const deltaColor =
    !delta || delta.direction === "flat"
      ? "text-muted-foreground"
      : delta.good
      ? "text-[var(--status-good-text)]"
      : "text-[var(--status-danger)]";

  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      onClick={onClick}
      className={cn(
        "border rounded-lg px-3 py-2 text-left flex flex-col gap-1",
        onClick && "cursor-pointer hover:bg-accent/50 transition-colors",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {spark && spark.length >= 3 && <Sparkline values={spark} />}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {delta && (
          <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", deltaColor)}>
            <span>{ARROWS[delta.direction]}</span>
            <span>{delta.text}</span>
          </span>
        )}
      </div>
    </Comp>
  );
}

export function StatTileRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 sm:grid-cols-4 gap-2", className)}>{children}</div>;
}
