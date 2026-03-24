"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface GoalTarget {
  nutrient: string;
  target: number;
  direction: "min" | "max" | "target";
}

interface Props {
  totals: Totals;
  goals: GoalTarget[];
}

interface NutrientRowProps {
  label: string;
  value: number;
  unit: string;
  goal: GoalTarget | undefined;
  barColor: string;
  large?: boolean;
}

function goalStatus(value: number, goal: GoalTarget): "met" | "warn" | "over" | null {
  const pct = goal.target > 0 ? value / goal.target : 0;
  if (goal.direction === "target") {
    const delta = Math.abs(pct - 1);
    return delta <= 0.02 ? "met" : delta <= 0.10 ? "warn" : "over";
  }
  if (goal.direction === "max") {
    return pct <= 1 ? "met" : pct <= 1.10 ? "warn" : "over";
  }
  if (goal.direction === "min") {
    return pct >= 1 ? "met" : pct >= 0.90 ? "warn" : "over";
  }
  return null;
}

function GoalIcon({ status }: { status: "met" | "warn" | "over" }) {
  if (status === "met") return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-green-500 shrink-0">
      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
    </svg>
  );
  if (status === "over") return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-red-500 shrink-0">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.75 4.75a.75.75 0 0 1 1.5 0v2.5a.75.75 0 0 1-1.5 0v-2.5Zm.75 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
    </svg>
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-amber-500 shrink-0">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.75 4.75a.75.75 0 0 1 1.5 0v2.5a.75.75 0 0 1-1.5 0v-2.5Zm.75 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
    </svg>
  );
}

function NutrientRow({ label, value, unit, goal, barColor, large = false }: NutrientRowProps) {
  const hasGoal = goal !== undefined && goal.target > 0;
  const pct = hasGoal ? Math.min(100, (value / goal.target) * 100) : 0;
  const status = hasGoal ? goalStatus(value, goal) : null;

  // Determine bar fill color based on direction and progress
  let fillColor = barColor;
  if (hasGoal && status) {
    if (status === "over") fillColor = "bg-red-500";
    else if (status === "warn") fillColor = "bg-amber-500";
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {status && <GoalIcon status={status} />}
          <span className={cn("text-muted-foreground", large ? "text-sm font-medium" : "text-xs")}>
            {label}
          </span>
        </div>
        <span className={cn("font-semibold tabular-nums", large ? "text-base" : "text-sm")}>
          {Math.round(value)}
          {hasGoal && (
            <span className="text-muted-foreground font-normal">
              {" / "}{Math.round(goal.target)}{unit}
            </span>
          )}
          {!hasGoal && <span className="text-muted-foreground font-normal">{unit}</span>}
        </span>
      </div>
      {hasGoal && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-300", fillColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

const DONUT_COLORS = ["#22c55e", "#f59e0b", "#60a5fa"];

function MacroDonut({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const proteinCal = protein * 4;
  const carbsCal = carbs * 4;
  const fatCal = fat * 9;
  const total = proteinCal + carbsCal + fatCal;
  if (total < 1) return null;

  const data = [
    { name: "Protein", value: proteinCal, pct: Math.round((proteinCal / total) * 100) },
    { name: "Carbs", value: carbsCal, pct: Math.round((carbsCal / total) * 100) },
    { name: "Fat", value: fatCal, pct: Math.round((fatCal / total) * 100) },
  ];

  return (
    <div className="flex items-center gap-3">
      <div className="w-[72px] h-[72px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" dataKey="value" strokeWidth={0} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { name: string; pct: number };
                return (
                  <div className="rounded border border-border bg-popover px-2 py-1 text-xs shadow">
                    {p.name}: {p.pct}%
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-0.5 text-xs">
        {data.map((d, i) => (
          <span key={d.name} style={{ color: DONUT_COLORS[i] }}>{d.name} {d.pct}%</span>
        ))}
      </div>
    </div>
  );
}

export default function MacroSummaryBar({ totals, goals }: Props) {
  const findGoal = (nutrient: string) => goals.find((g) => g.nutrient === nutrient);
  const hasMacros = totals.protein > 0 || totals.carbs > 0 || totals.fat > 0;

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow p-4 mb-4 flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <div className="flex-1 flex flex-col gap-3">
          <NutrientRow
            label="Calories"
            value={totals.calories}
            unit=" kcal"
            goal={findGoal("calories")}
            barColor="bg-orange-500"
            large
          />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <NutrientRow
              label="Protein"
              value={totals.protein}
              unit="g"
              goal={findGoal("protein")}
              barColor="bg-green-500"
            />
            <NutrientRow
              label="Carbs"
              value={totals.carbs}
              unit="g"
              goal={findGoal("carbs")}
              barColor="bg-amber-400"
            />
            <NutrientRow
              label="Fat"
              value={totals.fat}
              unit="g"
              goal={findGoal("fat")}
              barColor="bg-blue-500"
            />
            <NutrientRow
              label="Fiber"
              value={totals.fiber}
              unit="g"
              goal={findGoal("fiber")}
              barColor="bg-purple-500"
            />
          </div>
        </div>
        {hasMacros && (
          <MacroDonut protein={totals.protein} carbs={totals.carbs} fat={totals.fat} />
        )}
      </div>
    </div>
  );
}
