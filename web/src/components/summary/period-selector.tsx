"use client";

import { useState } from "react";
import { getLocalDateString } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type PeriodType = "week" | "month" | "quarter" | "year";

export type PeriodSelectorProps = {
  type: PeriodType;
  onTypeChange: (type: PeriodType) => void;
  onPrevious: () => void;
  onNext: () => void;
  canGoNext: boolean;
  periodLabel: string;
  currentStart: string;
  onDateSelect: (date: string) => void;
};

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

// Generate month options for the last 5 years
function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  for (let y = currentYear; y >= currentYear - 5; y--) {
    const maxMonth = y === currentYear ? currentMonth : 11;
    for (let m = maxMonth; m >= 0; m--) {
      const date = new Date(y, m, 15);
      options.push({
        value: `${y}-${String(m + 1).padStart(2, "0")}-15`,
        label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      });
    }
  }
  return options;
}

// Generate quarter options
function getQuarterOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3);

  for (let y = currentYear; y >= currentYear - 5; y--) {
    const maxQ = y === currentYear ? currentQuarter : 3;
    for (let q = maxQ; q >= 0; q--) {
      const month = q * 3 + 1; // Middle of quarter
      options.push({
        value: `${y}-${String(month + 1).padStart(2, "0")}-15`,
        label: `Q${q + 1} ${y}`,
      });
    }
  }
  return options;
}

// Generate year options
function getYearOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const currentYear = new Date().getFullYear();

  for (let y = currentYear; y >= currentYear - 10; y--) {
    options.push({
      value: `${y}-06-15`,
      label: String(y),
    });
  }
  return options;
}

// Generate week options (last 52 weeks)
function getWeekOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();

  for (let i = 0; i < 52; i++) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - i * 7);
    // Get Monday of that week
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endLabel = weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    options.push({
      value: getLocalDateString(weekStart),
      label: `${startLabel} - ${endLabel}`,
    });
  }
  return options;
}

export function PeriodSelector({
  type,
  onTypeChange,
  onPrevious,
  onNext,
  canGoNext,
  periodLabel,
  currentStart,
  onDateSelect,
}: PeriodSelectorProps) {
  const [showPicker, setShowPicker] = useState(false);

  const getOptions = () => {
    switch (type) {
      case "week":
        return getWeekOptions();
      case "month":
        return getMonthOptions();
      case "quarter":
        return getQuarterOptions();
      case "year":
        return getYearOptions();
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Period type tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onTypeChange(opt.value)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              type === opt.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrevious}>
          &larr;
        </Button>

        <Select
          value={currentStart}
          onValueChange={(value) => onDateSelect(value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue>{periodLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {getOptions().map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={onNext} disabled={!canGoNext}>
          &rarr;
        </Button>
      </div>
    </div>
  );
}
