"use client";

import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import SetInputCell from "./SetInputCell";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

export type BucketSet = {
  reps: string;
  weight: string;
  is_pr: boolean;
  is_cycle_max: boolean;
  is_missed: boolean;
  is_move_up: boolean;
};

export type BucketExerciseData = {
  id: string;
  exercise_id: string | null;
  exercise_name_display: string;
  modifier_ids: string[];
  input_type: string; // strength, hiit, cardio, sport
  sets: BucketSet[];
  superset_group: number | null;
  // Cardio fields
  duration_minutes: string;
  distance_miles: string;
  incline_pct: string;
  cardio_weight: string;
  // HIIT fields
  cycles: string;
  time_on: string; // "M:SS" format
  time_off: string; // "M:SS" format
  // Exercise-level notes (for sport/other)
  exercise_notes: string;
};

type GhostSet = {
  set_number: number;
  reps: number | null;
  weight: number | null;
};

type BucketExerciseRowProps = {
  data: BucketExerciseData;
  ghostSets: GhostSet[];
  supersetActive: boolean;
  onUpdate: (updated: BucketExerciseData) => void;
  onRemove: () => void;
  /** Register a ref for focusing from other rows */
  registerFirstInput: (el: HTMLInputElement | null) => void;
  /** Focus the first input of the next row */
  focusNextRow: () => void;
  /** Open the exercise stats sheet for this exercise */
  onExerciseClick?: (exerciseId: string, exerciseName: string) => void;
};

const DEFAULT_SET_COUNT = 5;

export default function BucketExerciseRow({
  data,
  ghostSets,
  supersetActive,
  onUpdate,
  onRemove,
  registerFirstInput,
  focusNextRow,
  onExerciseClick,
}: BucketExerciseRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: data.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const { toast } = useToast();

  // Ref map for set inputs: `reps-{i}` and `weight-{i}`
  const inputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  const setInputRef = useCallback(
    (key: string) => (el: HTMLInputElement | null) => {
      inputRefs.current.set(key, el);
    },
    []
  );

  // Ensure minimum set count
  const displaySets = data.sets.length < DEFAULT_SET_COUNT
    ? [
        ...data.sets,
        ...Array.from({ length: DEFAULT_SET_COUNT - data.sets.length }, () => ({
          reps: "",
          weight: "",
          is_pr: false,
          is_cycle_max: false,
          is_missed: false,
          is_move_up: false,
        })),
      ]
    : data.sets;

  const updateSet = (index: number, field: keyof BucketSet, value: string | boolean) => {
    const newSets = [...displaySets];
    newSets[index] = { ...newSets[index], [field]: value };
    onUpdate({ ...data, sets: newSets });
  };

  const toggleFlag = (index: number, flag: "is_pr" | "is_cycle_max" | "is_missed" | "is_move_up") => {
    const newSets = [...displaySets];
    newSets[index] = { ...newSets[index], [flag]: !newSets[index][flag] };
    onUpdate({ ...data, sets: newSets });
  };

  const acceptAllGhosts = () => {
    const newSets = displaySets.map((set, i) => {
      const ghost = ghostSets[i];
      if (!ghost) return set;
      return {
        ...set,
        reps: set.reps || (ghost.reps != null ? String(ghost.reps) : set.reps),
        weight: set.weight || (ghost.weight != null ? String(ghost.weight) : set.weight),
      };
    });
    onUpdate({ ...data, sets: newSets });
  };

  const addSet = () => {
    const newSets = [
      ...displaySets,
      { reps: "", weight: "", is_pr: false, is_cycle_max: false, is_missed: false, is_move_up: false },
    ];
    onUpdate({ ...data, sets: newSets });
    // Focus new set's reps after render
    requestAnimationFrame(() => {
      const el = inputRefs.current.get(`reps-${newSets.length - 1}`);
      el?.focus();
    });
  };

  const copyFromLeft = (targetIndex: number) => {
    // Find the nearest populated set to the left of targetIndex
    let sourceIndex = -1;
    for (let i = targetIndex - 1; i >= 0; i--) {
      if (displaySets[i].reps || displaySets[i].weight) {
        sourceIndex = i;
        break;
      }
    }

    if (sourceIndex === -1) {
      toast("Nothing to copy", "info");
      return;
    }

    const src = displaySets[sourceIndex];
    const newSets = [...displaySets];
    for (let i = sourceIndex + 1; i <= targetIndex; i++) {
      newSets[i] = { ...newSets[i], reps: src.reps, weight: src.weight };
    }
    onUpdate({ ...data, sets: newSets });
  };

  const handleRepsKeyDown = (setIdx: number) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      focusNextRow();
    }
  };

  const handleWeightKeyDown = (setIdx: number) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      focusNextRow();
    }
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSet();
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      focusNextRow();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-2 py-2 px-2 rounded-md border bg-card",
        supersetActive && "border-l-2 border-l-blue-400",
        isDragging && "z-50"
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="mt-5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="mt-5 text-muted-foreground hover:text-destructive transition-colors"
        title="Remove exercise"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>

      {/* Exercise content */}
      <div className="flex-1 min-w-0">
        {data.exercise_id && onExerciseClick ? (
          <button
            type="button"
            onClick={() => onExerciseClick(data.exercise_id!, data.exercise_name_display)}
            className="text-sm font-medium mb-1 truncate text-left hover:text-primary hover:underline underline-offset-2 transition-colors"
          >
            {data.exercise_name_display}
          </button>
        ) : (
          <div className="text-sm font-medium mb-1 truncate">{data.exercise_name_display}</div>
        )}

        {data.input_type === "strength" && (
          <>
            {/* Set inputs */}
            <div className="flex items-start gap-1 overflow-x-auto pb-1">
              {ghostSets.some((g) => g?.reps != null || g?.weight != null) && (
                <button
                  type="button"
                  onClick={acceptAllGhosts}
                  className="mt-3 flex-shrink-0 w-6 h-14 flex items-center justify-center text-amber-400 hover:text-amber-300 transition-colors"
                  title="Accept previous session values"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </button>
              )}
              {displaySets.map((set, i) => {
                const ghost = ghostSets[i];
                return (
                  <SetInputCell
                    key={i}
                    setIndex={i}
                    reps={set.reps}
                    weight={set.weight}
                    ghostReps={ghost?.reps}
                    ghostWeight={ghost?.weight}
                    isPr={set.is_pr}
                    isCycleMax={set.is_cycle_max}
                    isMissed={set.is_missed}
                    isMoveUp={set.is_move_up}
                    onRepsChange={(v) => updateSet(i, "reps", v)}
                    onWeightChange={(v) => updateSet(i, "weight", v)}
                    onFlagToggle={(flag) => toggleFlag(i, flag)}
                    repsRef={(el) => {
                      setInputRef(`reps-${i}`)(el);
                      if (i === 0) registerFirstInput(el);
                    }}
                    weightRef={setInputRef(`weight-${i}`)}
                    onRepsKeyDown={handleRepsKeyDown(i)}
                    onWeightKeyDown={handleWeightKeyDown(i)}
                    onCopyLeft={i > 0 ? () => copyFromLeft(i) : undefined}
                  />
                );
              })}

              {/* Add set button */}
              <button
                type="button"
                onClick={addSet}
                onKeyDown={handleAddKeyDown}
                className="mt-3 w-8 h-14 flex items-center justify-center border border-dashed rounded text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                title="Add set"
              >
                +
              </button>
            </div>
          </>
        )}

        {data.input_type === "hiit" && (
          <div className="flex flex-wrap items-start gap-2 pb-1">
            <LabeledInput
              label="On (m:ss)"
              value={data.time_on}
              onChange={(v) => onUpdate({ ...data, time_on: v })}
              placeholder="1:00"
              inputRef={(el) => registerFirstInput(el)}
            />
            <LabeledInput
              label="Off (m:ss)"
              value={data.time_off}
              onChange={(v) => onUpdate({ ...data, time_off: v })}
              placeholder="0:30"
            />
            <LabeledInput
              label="Cycles"
              value={data.cycles}
              onChange={(v) => onUpdate({ ...data, cycles: v })}
              placeholder="10"
              type="number"
            />
            <LabeledInput
              label="Notes"
              value={data.exercise_notes}
              onChange={(v) => onUpdate({ ...data, exercise_notes: v })}
              placeholder=""
              wide
            />
          </div>
        )}

        {data.input_type === "cardio" && (
          <div className="flex flex-wrap items-start gap-2 pb-1">
            <LabeledInput
              label="Minutes"
              value={data.duration_minutes}
              onChange={(v) => onUpdate({ ...data, duration_minutes: v })}
              placeholder=""
              type="number"
              inputRef={(el) => registerFirstInput(el)}
            />
            <LabeledInput
              label="Miles"
              value={data.distance_miles}
              onChange={(v) => onUpdate({ ...data, distance_miles: v })}
              placeholder=""
              type="number"
            />
            <LabeledInput
              label="Incline %"
              value={data.incline_pct}
              onChange={(v) => onUpdate({ ...data, incline_pct: v })}
              placeholder=""
              type="number"
            />
            <LabeledInput
              label="Weight (lbs)"
              value={data.cardio_weight}
              onChange={(v) => onUpdate({ ...data, cardio_weight: v })}
              placeholder=""
              type="number"
            />
            <LabeledInput
              label="Notes"
              value={data.exercise_notes}
              onChange={(v) => onUpdate({ ...data, exercise_notes: v })}
              placeholder=""
              wide
            />
          </div>
        )}

        {data.input_type === "sport" && (
          <div className="flex flex-wrap items-start gap-2 pb-1">
            <LabeledInput
              label="Notes"
              value={data.exercise_notes}
              onChange={(v) => onUpdate({ ...data, exercise_notes: v })}
              placeholder="Duration, details..."
              wide
              inputRef={(el) => registerFirstInput(el)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Simple labeled input for non-strength exercise types
function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  wide = false,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  wide?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <div className={wide ? "flex-1 min-w-[120px]" : ""}>
      <label className="text-[10px] text-muted-foreground block mb-0.5">{label}</label>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-7 px-2 border rounded text-sm tabular-nums",
          wide ? "w-full" : "w-20"
        )}
      />
    </div>
  );
}
