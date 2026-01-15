"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  maxDate?: string; // YYYY-MM-DD
  availableYears?: number[]; // Years that have data
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  maxDate,
  availableYears,
  className,
}: DatePickerProps) {
  // Parse current value
  const [year, month, day] = value.split("-").map((s) => s || "");

  // Local input state (not committed until Enter)
  const [localMonth, setLocalMonth] = useState(month);
  const [localDay, setLocalDay] = useState(day);
  const [localYear, setLocalYear] = useState(year);

  // Refs for auto-advance
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Dropdown state
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calendar view state (separate from input state - controls what month/year the calendar shows)
  const [viewMonth, setViewMonth] = useState(parseInt(month) || 1);
  const [viewYear, setViewYear] = useState(parseInt(year) || new Date().getFullYear());

  // Sync local state when value prop changes
  useEffect(() => {
    const [y, m, d] = value.split("-");
    setLocalYear(y || "");
    setLocalMonth(m || "");
    setLocalDay(d || "");
  }, [value]);

  // Sync calendar view when dropdown opens (show the month/year of current value)
  useEffect(() => {
    if (showDropdown) {
      setViewMonth(parseInt(localMonth) || 1);
      setViewYear(parseInt(localYear) || new Date().getFullYear());
    }
  }, [showDropdown, localMonth, localYear]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Build the date string and validate
  const buildDate = useCallback((m: string, d: string, y: string): string | null => {
    if (m.length !== 2 || d.length !== 2 || y.length !== 4) return null;
    const dateStr = `${y}-${m}-${d}`;
    // Validate it's a real date
    const date = new Date(dateStr + "T00:00:00");
    if (isNaN(date.getTime())) return null;
    // Check it matches (handles invalid dates like 02-31)
    const check = date.toISOString().slice(0, 10);
    if (check !== dateStr) return null;
    return dateStr;
  }, []);

  // Commit the date
  const commitDate = useCallback(() => {
    const dateStr = buildDate(localMonth, localDay, localYear);
    if (dateStr) {
      if (maxDate && dateStr > maxDate) {
        // Don't allow future dates
        return;
      }
      onChange(dateStr);
    }
  }, [localMonth, localDay, localYear, buildDate, maxDate, onChange]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitDate();
    }
  };

  // Month input handler with auto-advance
  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 2);
    setLocalMonth(val);
    if (val.length === 2) {
      dayRef.current?.focus();
      dayRef.current?.select();
    }
  };

  // Day input handler with auto-advance
  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 2);
    setLocalDay(val);
    if (val.length === 2) {
      yearRef.current?.focus();
      yearRef.current?.select();
    }
  };

  // Year input handler
  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
    setLocalYear(val);
  };

  // Generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = availableYears && availableYears.length > 0
    ? [...availableYears].sort((a, b) => b - a)
    : Array.from({ length: 10 }, (_, i) => currentYear - i);

  // Generate month options
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Handle selecting a specific day from the calendar grid
  const handleDaySelect = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!maxDate || dateStr <= maxDate) {
      // Update local input state
      setLocalMonth(String(viewMonth).padStart(2, "0"));
      setLocalDay(String(day).padStart(2, "0"));
      setLocalYear(String(viewYear));
      // Commit the date
      onChange(dateStr);
      // Close dropdown
      setShowDropdown(false);
    }
  };

  // Navigate by day
  const goToPrevDay = () => {
    const date = new Date(value + "T00:00:00");
    date.setDate(date.getDate() - 1);
    const newDate = date.toISOString().slice(0, 10);
    onChange(newDate);
  };

  const goToNextDay = () => {
    const date = new Date(value + "T00:00:00");
    date.setDate(date.getDate() + 1);
    const newDate = date.toISOString().slice(0, 10);
    if (!maxDate || newDate <= maxDate) {
      onChange(newDate);
    }
  };

  const isAtMax = maxDate && value >= maxDate;

  return (
    <div className={cn("flex items-center gap-1", className)} ref={dropdownRef}>
      {/* Prev day button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={goToPrevDay}
        className="h-8 w-8 p-0 text-muted-foreground"
        title="Previous day"
      >
        ‹
      </Button>

      {/* Date inputs */}
      <div className="relative">
        <div
          className="flex items-center border rounded px-2 py-1 bg-background cursor-pointer"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <input
            ref={monthRef}
            type="text"
            inputMode="numeric"
            value={localMonth}
            onChange={handleMonthChange}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="MM"
            className="w-6 text-center text-sm bg-transparent outline-none"
            maxLength={2}
          />
          <span className="text-muted-foreground">/</span>
          <input
            ref={dayRef}
            type="text"
            inputMode="numeric"
            value={localDay}
            onChange={handleDayChange}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="DD"
            className="w-6 text-center text-sm bg-transparent outline-none"
            maxLength={2}
          />
          <span className="text-muted-foreground">/</span>
          <input
            ref={yearRef}
            type="text"
            inputMode="numeric"
            value={localYear}
            onChange={handleYearChange}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="YYYY"
            className="w-10 text-center text-sm bg-transparent outline-none"
            maxLength={4}
          />
          <span className="ml-1 text-muted-foreground text-xs">▼</span>
        </div>

        {/* Dropdown calendar */}
        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg z-50 p-3 min-w-[200px]">
            <div className="flex gap-2 mb-2">
              {/* Month dropdown - only changes view, doesn't commit */}
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value))}
                className="flex-1 h-8 text-sm border rounded px-2 bg-background"
              >
                {monthNames.map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Year dropdown - only changes view, doesn't commit */}
              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value))}
                className="w-20 h-8 text-sm border rounded px-2 bg-background"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Day grid for selected month/year */}
            <div className="grid grid-cols-7 gap-1 text-xs">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="text-center text-muted-foreground font-medium py-1">
                  {d}
                </div>
              ))}
              {(() => {
                const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();
                const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
                const days = [];

                // Empty cells for days before first of month
                for (let i = 0; i < firstDay; i++) {
                  days.push(<div key={`empty-${i}`} />);
                }

                // Day buttons
                for (let d = 1; d <= daysInMonth; d++) {
                  const dateStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const isSelected = dateStr === value;
                  const isFuture = maxDate && dateStr > maxDate;

                  days.push(
                    <button
                      key={d}
                      type="button"
                      disabled={isFuture}
                      onClick={() => handleDaySelect(d)}
                      className={cn(
                        "h-7 w-7 rounded text-center hover:bg-muted",
                        isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                        isFuture && "text-muted-foreground/50 cursor-not-allowed"
                      )}
                    >
                      {d}
                    </button>
                  );
                }

                return days;
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Next day button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={goToNextDay}
        disabled={!!isAtMax}
        className="h-8 w-8 p-0 text-muted-foreground"
        title="Next day"
      >
        ›
      </Button>
    </div>
  );
}
