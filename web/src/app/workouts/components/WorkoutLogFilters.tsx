"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkoutType, ExerciseGroup } from "../types";

export type DatePreset = "30d" | "60d" | "90d" | "year" | "all";

export type FilterState = {
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
  typeIds: Set<string>;
  exerciseSearch: string;
  groupId: string; // "" = all
};

type Props = {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  workoutTypes: WorkoutType[];
  groups: ExerciseGroup[];
};

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "60d", label: "60d" },
  { value: "90d", label: "90d" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

function getPresetDates(preset: DatePreset): { start: string; end: string } {
  const end = new Date().toISOString().slice(0, 10);
  if (preset === "all") return { start: "", end };
  const d = new Date();
  switch (preset) {
    case "30d":
      d.setDate(d.getDate() - 30);
      break;
    case "60d":
      d.setDate(d.getDate() - 60);
      break;
    case "90d":
      d.setDate(d.getDate() - 90);
      break;
    case "year":
      d.setFullYear(d.getFullYear() - 1);
      break;
  }
  return { start: d.toISOString().slice(0, 10), end };
}

export function getInitialFilters(): FilterState {
  const { start, end } = getPresetDates("30d");
  return {
    datePreset: "30d",
    startDate: start,
    endDate: end,
    typeIds: new Set(),
    exerciseSearch: "",
    groupId: "",
  };
}

export default function WorkoutLogFilters({
  filters,
  onChange,
  workoutTypes,
  groups,
}: Props) {
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setTypePopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handlePreset = (preset: DatePreset) => {
    const { start, end } = getPresetDates(preset);
    onChange({ ...filters, datePreset: preset, startDate: start, endDate: end });
  };

  const handleDateChange = (field: "startDate" | "endDate", value: string) => {
    onChange({ ...filters, [field]: value, datePreset: "30d" }); // reset preset label when custom
  };

  const toggleType = (typeId: string) => {
    const next = new Set(filters.typeIds);
    if (next.has(typeId)) next.delete(typeId);
    else next.add(typeId);
    onChange({ ...filters, typeIds: next });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Date presets */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Range
        </label>
        <div className="flex">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePreset(p.value)}
              className={`px-2.5 py-1.5 text-xs font-medium border transition-colors first:rounded-l-md last:rounded-r-md ${
                filters.datePreset === p.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-input hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          From
        </label>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => handleDateChange("startDate", e.target.value)}
          className="h-8 px-2 border rounded-md text-xs w-[130px]"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">To</label>
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => handleDateChange("endDate", e.target.value)}
          className="h-8 px-2 border rounded-md text-xs w-[130px]"
        />
      </div>

      {/* Workout type multi-select */}
      <div className="relative" ref={popoverRef}>
        <label className="text-xs text-muted-foreground block mb-1">
          Type
        </label>
        <button
          onClick={() => setTypePopoverOpen((v) => !v)}
          className="h-8 px-2.5 border rounded-md text-xs bg-background hover:bg-accent transition-colors min-w-[100px] text-left"
        >
          {filters.typeIds.size === 0
            ? "All types"
            : `${filters.typeIds.size} selected`}
        </button>
        {typePopoverOpen && (
          <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg py-1 min-w-[180px] z-50 max-h-60 overflow-y-auto">
            {workoutTypes.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={filters.typeIds.has(t.id)}
                  onChange={() => toggleType(t.id)}
                  className="rounded"
                />
                {t.name}
              </label>
            ))}
            {filters.typeIds.size > 0 && (
              <>
                <div className="border-t my-1" />
                <button
                  onClick={() => onChange({ ...filters, typeIds: new Set() })}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent w-full text-left"
                >
                  Clear all
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Exercise search */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Exercise
        </label>
        <Input
          value={filters.exerciseSearch}
          onChange={(e) =>
            onChange({ ...filters, exerciseSearch: e.target.value })
          }
          placeholder="Search..."
          className="h-8 text-xs w-[140px]"
        />
      </div>

      {/* Group filter */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Group
        </label>
        <Select
          value={filters.groupId || "all"}
          onValueChange={(v) =>
            onChange({ ...filters, groupId: v === "all" ? "" : v })
          }
        >
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reset */}
      {(filters.typeIds.size > 0 ||
        filters.exerciseSearch ||
        filters.groupId) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() =>
            onChange({
              ...filters,
              typeIds: new Set(),
              exerciseSearch: "",
              groupId: "",
            })
          }
        >
          Reset filters
        </Button>
      )}
    </div>
  );
}
