"use client";

import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

type SetInputCellProps = {
  setIndex: number;
  reps: string;
  weight: string;
  ghostReps?: number | null;
  ghostWeight?: number | null;
  isPr: boolean;
  isCycleMax: boolean;
  isMissed: boolean;
  isMoveUp: boolean;
  onRepsChange: (value: string) => void;
  onWeightChange: (value: string) => void;
  onFlagToggle: (flag: "is_pr" | "is_cycle_max" | "is_missed" | "is_move_up") => void;
  repsRef?: (el: HTMLInputElement | null) => void;
  weightRef?: (el: HTMLInputElement | null) => void;
  onRepsKeyDown?: (e: React.KeyboardEvent) => void;
  onWeightKeyDown?: (e: React.KeyboardEvent) => void;
  onCopyLeft?: () => void;
};

export default function SetInputCell({
  setIndex,
  reps,
  weight,
  ghostReps,
  ghostWeight,
  isPr,
  isCycleMax,
  isMissed,
  isMoveUp,
  onRepsChange,
  onWeightChange,
  onFlagToggle,
  repsRef,
  weightRef,
  onRepsKeyDown,
  onWeightKeyDown,
  onCopyLeft,
}: SetInputCellProps) {
  const localRepsRef = useRef<HTMLInputElement | null>(null);
  const localWeightRef = useRef<HTMLInputElement | null>(null);

  const setRepsRef = useCallback(
    (el: HTMLInputElement | null) => {
      localRepsRef.current = el;
      repsRef?.(el);
    },
    [repsRef]
  );

  const setWeightRef = useCallback(
    (el: HTMLInputElement | null) => {
      localWeightRef.current = el;
      weightRef?.(el);
    },
    [weightRef]
  );

  const handleRepsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+P/M/X for flags
    if (e.ctrlKey) {
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        onFlagToggle("is_pr");
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        onFlagToggle("is_cycle_max");
        return;
      }
      if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        onFlagToggle("is_missed");
        return;
      }
      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        onFlagToggle("is_move_up");
        return;
      }
    }

    // Tab over ghost text = accept ghost value
    if (e.key === "Tab" && !e.shiftKey && !reps && ghostReps != null) {
      onRepsChange(String(ghostReps));
    }

    onRepsKeyDown?.(e);
  };

  const handleWeightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey) {
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        onFlagToggle("is_pr");
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        onFlagToggle("is_cycle_max");
        return;
      }
      if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        onFlagToggle("is_missed");
        return;
      }
      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        onFlagToggle("is_move_up");
        return;
      }
    }

    // Tab over ghost text = accept ghost value
    if (e.key === "Tab" && !e.shiftKey && !weight && ghostWeight != null) {
      onWeightChange(String(ghostWeight));
    }

    onWeightKeyDown?.(e);
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      {onCopyLeft ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={onCopyLeft}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Copy from previous set"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" />
          </svg>
        </button>
      ) : (
        <span className="h-3" />
      )}
      <span className="text-[10px] text-muted-foreground">S{setIndex + 1}</span>
      <input
        ref={setRepsRef}
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => onRepsChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={handleRepsKeyDown}
        placeholder={ghostReps != null ? String(ghostReps) : "R"}
        className="w-14 h-7 px-1 text-center border rounded text-sm tabular-nums placeholder:text-muted-foreground/40"
      />
      <input
        ref={setWeightRef}
        type="number"
        inputMode="numeric"
        value={weight}
        onChange={(e) => onWeightChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={handleWeightKeyDown}
        placeholder={ghostWeight != null ? String(ghostWeight) : "W"}
        className="w-14 h-7 px-1 text-center border rounded text-sm tabular-nums placeholder:text-muted-foreground/40"
      />
      <div className="flex gap-0.5">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onFlagToggle("is_pr")}
          className={cn(
            "w-4 h-4 rounded text-[8px] font-bold leading-none flex items-center justify-center transition-colors",
            isPr
              ? "bg-amber-400 text-amber-900"
              : "bg-muted text-muted-foreground/50 hover:text-muted-foreground"
          )}
          title="PR (Ctrl+P)"
        >
          P
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onFlagToggle("is_cycle_max")}
          className={cn(
            "w-4 h-4 rounded text-[8px] font-bold leading-none flex items-center justify-center transition-colors",
            isCycleMax
              ? "bg-blue-400 text-blue-900"
              : "bg-muted text-muted-foreground/50 hover:text-muted-foreground"
          )}
          title="Cycle Max (Ctrl+M)"
        >
          M
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onFlagToggle("is_missed")}
          className={cn(
            "w-4 h-4 rounded text-[8px] font-bold leading-none flex items-center justify-center transition-colors",
            isMissed
              ? "bg-red-400 text-red-900"
              : "bg-muted text-muted-foreground/50 hover:text-muted-foreground"
          )}
          title="Missed (Ctrl+X)"
        >
          X
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onFlagToggle("is_move_up")}
          className={cn(
            "w-4 h-4 rounded text-[8px] font-bold leading-none flex items-center justify-center transition-colors",
            isMoveUp
              ? "bg-green-500 text-green-950"
              : "bg-muted text-muted-foreground/50 hover:text-muted-foreground"
          )}
          title="Ready to Progress (Ctrl+U)"
        >
          U
        </button>
      </div>
    </div>
  );
}
