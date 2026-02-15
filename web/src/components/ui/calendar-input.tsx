"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CalendarInputProps {
  value: string; // YYYY-MM-DD or ""
  onChange: (date: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function CalendarInput({
  value,
  onChange,
  placeholder = "Select date",
  label,
  className,
}: CalendarInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calendar view state
  const parsed = value ? value.split("-").map(Number) : null;
  const [viewYear, setViewYear] = useState(parsed?.[0] || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.[1] || new Date().getMonth() + 1);

  // Sync calendar view when dropdown opens
  useEffect(() => {
    if (showDropdown) {
      if (value) {
        const [y, m] = value.split("-").map(Number);
        setViewYear(y);
        setViewMonth(m);
      } else {
        setViewYear(new Date().getFullYear());
        setViewMonth(new Date().getMonth() + 1);
      }
    }
  }, [showDropdown, value]);

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

  const handleDaySelect = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(dateStr);
    setShowDropdown(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setShowDropdown(false);
  };

  // Format display
  const displayValue = value
    ? (() => {
        const [y, m, d] = value.split("-").map(Number);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[m - 1]} ${d}, ${y}`;
      })()
    : "";

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 15 }, (_, i) => currentYear - i + 2);

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      {label && <label className="text-xs text-muted-foreground">{label}</label>}
      <button
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-full h-9 px-3 border rounded-md text-sm text-left bg-background hover:bg-accent/50 transition-colors flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={value ? "" : "text-muted-foreground"}>
          {displayValue || placeholder}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground text-xs leading-none"
              title="Clear date"
            >
              x
            </span>
          )}
          <span className="text-muted-foreground text-xs">&#x25BC;</span>
        </span>
      </button>

      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg z-50 p-3 min-w-[220px]">
          <div className="flex gap-2 mb-2">
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

          <div className="grid grid-cols-7 gap-1 text-xs">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="text-center text-muted-foreground font-medium py-1">
                {d}
              </div>
            ))}
            {(() => {
              const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();
              const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
              const cells = [];

              for (let i = 0; i < firstDay; i++) {
                cells.push(<div key={`empty-${i}`} />);
              }

              for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const isSelected = dateStr === value;

                cells.push(
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDaySelect(d)}
                    className={cn(
                      "h-7 w-7 rounded text-center hover:bg-muted",
                      isSelected && "bg-primary text-primary-foreground hover:bg-primary"
                    )}
                  >
                    {d}
                  </button>
                );
              }

              return cells;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
