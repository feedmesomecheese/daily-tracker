"use client";

import { cn } from "@/lib/utils";

type WorkoutRatingProps = {
  value: number | null;
  onChange: (value: number | null) => void;
};

export default function WorkoutRating({ value, onChange }: WorkoutRatingProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1">Rating:</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "w-7 h-7 rounded-full text-xs font-medium border transition-colors",
            value !== null && n <= value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary/50"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
