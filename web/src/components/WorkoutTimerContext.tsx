"use client";

import React, { createContext, useContext, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useWorkoutTimer, type WorkoutTimerState } from "@/hooks/useWorkoutTimer";
import { WorkoutTimerFAB, WorkoutTimerSheet } from "@/components/workout-timer/WorkoutTimerSheet";

type WorkoutTimerContextValue = {
  timer: WorkoutTimerState;
  timerOpen: boolean;
  setTimerOpen: (v: boolean) => void;
  setSendToWorkout: (cb: ((seconds: number) => void) | null) => void;
  /** Pages with a right-side FAB call this to push the timer FAB up above theirs */
  setFabOffset: (bottomClass: string) => void;
};

const WorkoutTimerContext = createContext<WorkoutTimerContextValue | null>(null);

export function WorkoutTimerProvider({ children }: { children: React.ReactNode }) {
  const timer = useWorkoutTimer();
  const [timerOpen, setTimerOpen] = useState(false);
  const [fabOffset, setFabOffsetState] = useState("bottom-6");
  const sendToWorkoutRef = useRef<((s: number) => void) | null>(null);
  const pathname = usePathname();

  const setSendToWorkout = useCallback((cb: ((s: number) => void) | null) => {
    sendToWorkoutRef.current = cb;
  }, []);

  const setFabOffset = useCallback((bottomClass: string) => {
    setFabOffsetState(bottomClass);
  }, []);

  const onSendToWorkout = useCallback((s: number) => {
    sendToWorkoutRef.current?.(s);
  }, []);

  // Always show FAB on workouts page; elsewhere only when a timer is actively running
  const showFAB = pathname === "/workouts" || timer.anyRunning;

  // Today page always has the metric FAB at bottom-6, so always offset above it.
  // Other pages use the offset set by the page (defaults to bottom-6).
  const fabBottom = pathname === "/" ? "bottom-24" : fabOffset;

  return (
    <WorkoutTimerContext.Provider value={{ timer, timerOpen, setTimerOpen, setSendToWorkout, setFabOffset }}>
      {children}
      {showFAB && (
        <WorkoutTimerFAB timer={timer} onClick={() => setTimerOpen(true)} bottomClass={fabBottom} />
      )}
      <WorkoutTimerSheet
        timer={timer}
        open={timerOpen}
        onOpenChange={setTimerOpen}
        onSendToWorkout={sendToWorkoutRef.current ? onSendToWorkout : undefined}
      />
    </WorkoutTimerContext.Provider>
  );
}

export function useWorkoutTimerContext(): WorkoutTimerContextValue {
  const ctx = useContext(WorkoutTimerContext);
  if (!ctx) throw new Error("useWorkoutTimerContext must be used within WorkoutTimerProvider");
  return ctx;
}

