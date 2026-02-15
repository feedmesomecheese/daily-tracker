"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkoutType, ExerciseGroup, Exercise } from "../types";

export type DatePreset = "30d" | "60d" | "90d" | "year" | "all";

export type FlagFilter = "pr" | "max" | "miss";

export type FilterState = {
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
  typeIds: Set<string>;
  exerciseSearch: string;
  groupId: string; // "" = all
  flags: Set<FlagFilter>;
};

type Props = {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  workoutTypes: WorkoutType[];
  groups: ExerciseGroup[];
  exercises: Exercise[];
};

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "60d", label: "60d" },
  { value: "90d", label: "90d" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

const FLAG_OPTIONS: { value: FlagFilter; label: string; color: string }[] = [
  { value: "pr", label: "PR", color: "border-amber-600/30 bg-amber-600/10 text-amber-700" },
  { value: "max", label: "Max", color: "border-emerald-700/30 bg-emerald-700/10 text-emerald-700" },
  { value: "miss", label: "Miss", color: "border-red-700/30 bg-red-700/10 text-red-700" },
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
    flags: new Set(),
  };
}

export default function WorkoutLogFilters({
  filters,
  onChange,
  workoutTypes,
  groups,
  exercises,
}: Props) {
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const typePopoverRef = useRef<HTMLDivElement>(null);

  const [exerciseInputValue, setExerciseInputValue] = useState(filters.exerciseSearch);
  const [exerciseDropdownOpen, setExerciseDropdownOpen] = useState(false);
  const exerciseRef = useRef<HTMLDivElement>(null);

  const [showCustomDates, setShowCustomDates] = useState(false);

  // Sync local input with external filter (e.g. on reset)
  useEffect(() => {
    setExerciseInputValue(filters.exerciseSearch);
  }, [filters.exerciseSearch]);

  // Close popovers on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (typePopoverRef.current && !typePopoverRef.current.contains(e.target as Node)) {
        setTypePopoverOpen(false);
      }
      if (exerciseRef.current && !exerciseRef.current.contains(e.target as Node)) {
        setExerciseDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Exercise autocomplete suggestions
  const exerciseSuggestions = useMemo(() => {
    if (!exerciseInputValue || exerciseInputValue.length < 1) return [];
    const search = exerciseInputValue.toLowerCase();
    return exercises
      .filter((ex) => ex.name.toLowerCase().includes(search))
      .slice(0, 8);
  }, [exerciseInputValue, exercises]);

  const handlePreset = (preset: DatePreset) => {
    const { start, end } = getPresetDates(preset);
    onChange({ ...filters, datePreset: preset, startDate: start, endDate: end });
  };

  const handleDateChange = (field: "startDate" | "endDate", value: string) => {
    onChange({ ...filters, [field]: value, datePreset: "30d" });
  };

  const toggleType = (typeId: string) => {
    const next = new Set(filters.typeIds);
    if (next.has(typeId)) next.delete(typeId);
    else next.add(typeId);
    onChange({ ...filters, typeIds: next });
  };

  const toggleFlag = (flag: FlagFilter) => {
    const next = new Set(filters.flags);
    if (next.has(flag)) next.delete(flag);
    else next.add(flag);
    onChange({ ...filters, flags: next });
  };

  const handleExerciseInput = (value: string) => {
    setExerciseInputValue(value);
    setExerciseDropdownOpen(value.length >= 1);
    onChange({ ...filters, exerciseSearch: value });
  };

  const selectExercise = (name: string) => {
    setExerciseInputValue(name);
    setExerciseDropdownOpen(false);
    onChange({ ...filters, exerciseSearch: name });
  };

  // Build type trigger label
  const typeTriggerLabel = useMemo(() => {
    if (filters.typeIds.size === 0) return "All types";
    const names = workoutTypes
      .filter((t) => filters.typeIds.has(t.id))
      .map((t) => t.name);
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }, [filters.typeIds, workoutTypes]);

  const hasActiveFilters =
    filters.typeIds.size > 0 ||
    filters.exerciseSearch ||
    filters.groupId ||
    filters.flags.size > 0;

  return (
    <div className="space-y-2">
      {/* Row 1: Date presets + custom toggle + flags */}
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        {/* Date presets */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Range</label>
          <div className="flex">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePreset(p.value)}
                className={`px-2 sm:px-2.5 py-1.5 text-xs font-medium border transition-colors first:rounded-l-md last:rounded-r-md ${
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

        {/* Custom date toggle (mobile-friendly) */}
        <button
          onClick={() => setShowCustomDates((v) => !v)}
          className={`h-8 px-2 border rounded-md text-xs transition-colors ${
            showCustomDates
              ? "bg-accent border-primary/50"
              : "bg-background border-input hover:bg-accent"
          }`}
        >
          Custom
        </button>

        {/* Flag filters */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Flags</label>
          <div className="flex gap-1">
            {FLAG_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => toggleFlag(f.value)}
                className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  filters.flags.has(f.value)
                    ? f.color
                    : "bg-background border-input hover:bg-accent text-muted-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reset */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setExerciseInputValue("");
              onChange({
                ...filters,
                typeIds: new Set(),
                exerciseSearch: "",
                groupId: "",
                flags: new Set(),
              });
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {/* Custom date range (collapsible) */}
      {showCustomDates && (
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">From</label>
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
        </div>
      )}

      {/* Row 2: Type, Exercise, Group */}
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        {/* Workout type multi-select */}
        <div className="relative" ref={typePopoverRef}>
          <label className="text-xs text-muted-foreground block mb-1">Type</label>
          <button
            onClick={() => setTypePopoverOpen((v) => !v)}
            className={`h-8 px-2.5 border rounded-md text-xs bg-background hover:bg-accent transition-colors min-w-[90px] max-w-[200px] text-left truncate ${
              filters.typeIds.size > 0 ? "border-primary/50" : ""
            }`}
          >
            {typeTriggerLabel}
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

        {/* Exercise autocomplete */}
        <div className="relative flex-1 min-w-[140px] max-w-[220px]" ref={exerciseRef}>
          <label className="text-xs text-muted-foreground block mb-1">Exercise</label>
          <input
            type="text"
            value={exerciseInputValue}
            onChange={(e) => handleExerciseInput(e.target.value)}
            onFocus={() => {
              if (exerciseInputValue.length >= 1) setExerciseDropdownOpen(true);
            }}
            placeholder="Search exercises..."
            className={`h-8 px-2.5 border rounded-md text-xs w-full bg-background outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
              filters.exerciseSearch ? "border-primary/50" : ""
            }`}
          />
          {exerciseDropdownOpen && exerciseSuggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg py-1 w-full min-w-[180px] z-50 max-h-48 overflow-y-auto">
              {exerciseSuggestions.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => selectExercise(ex.name)}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  {ex.name}
                </button>
              ))}
            </div>
          )}
          {filters.exerciseSearch && (
            <button
              onClick={() => {
                setExerciseInputValue("");
                setExerciseDropdownOpen(false);
                onChange({ ...filters, exerciseSearch: "" });
              }}
              className="absolute right-1.5 top-[22px] text-muted-foreground hover:text-foreground text-xs px-1"
            >
              x
            </button>
          )}
        </div>

        {/* Group filter */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Group</label>
          <Select
            value={filters.groupId || "all"}
            onValueChange={(v) =>
              onChange({ ...filters, groupId: v === "all" ? "" : v })
            }
          >
            <SelectTrigger className={`h-8 text-xs w-[120px] sm:w-[140px] ${filters.groupId ? "border-primary/50" : ""}`}>
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
      </div>
    </div>
  );
}
