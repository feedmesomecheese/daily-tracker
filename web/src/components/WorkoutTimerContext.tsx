"use client";

import React, { createContext, useContext, useState, useRef, useCallback } from "react";
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

  const setSendToWorkout = useCallback((cb: ((s: number) => void) | null) => {
    sendToWorkoutRef.current = cb;
  }, []);

  const onSendToWorkout = useCallback((s: number) => {
    sendToWorkoutRef.current?.(s);
  }, []);

  return (
    <WorkoutTimerContext.Provider value={{ timer, timerOpen, setTimerOpen, setSendToWorkout }}>
      {children}
      {(timer.anyRunning || timer.swDisplay > 0) && (
        <WorkoutTimerFAB timer={timer} onClick={() => setTimerOpen(true)} />
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
