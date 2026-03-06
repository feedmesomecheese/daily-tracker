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
};

const WorkoutTimerContext = createContext<WorkoutTimerContextValue | null>(null);

export function WorkoutTimerProvider({ children }: { children: React.ReactNode }) {
  const timer = useWorkoutTimer();
  const [timerOpen, setTimerOpen] = useState(false);
  const sendToWorkoutRef = useRef<((s: number) => void) | null>(null);
  const pathname = usePathname();

  const setSendToWorkout = useCallback((cb: ((s: number) => void) | null) => {
    sendToWorkoutRef.current = cb;
  }, []);

  const onSendToWorkout = useCallback((s: number) => {
    sendToWorkoutRef.current?.(s);
  }, []);

  // Always show FAB on workouts page; elsewhere only when a timer is active
  const showFAB = pathname === "/workouts" || timer.anyRunning || timer.swDisplay > 0;

  // Stack above any per-page right FAB:
  //   /         → above metric FAB (bottom-6 h-14) → bottom-24
  //   /workouts → above exercise bucket FAB (bottom-24 h-14) → bottom-44
  //   elsewhere → bottom-6
  const fabBottom =
    pathname === "/" ? "bottom-24" :
    pathname === "/workouts" ? "bottom-44" :
    "bottom-6";

  return (
    <WorkoutTimerContext.Provider value={{ timer, timerOpen, setTimerOpen, setSendToWorkout }}>
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
