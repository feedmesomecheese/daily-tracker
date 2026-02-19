"use client";
import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";

export type WorkoutTourStatus = "idle" | "seeded" | "completed";

const STATUS_KEY = "tour_workout_status";
const IDS_KEY = "tour_workout_seed_ids";
const EVER_DONE_KEY = "tour_workout_ever_completed";

export type WorkoutSeedIds = {
  type_ids: string[];
  group_ids: string[];
  modifier_ids: string[];
  exercise_ids: string[];
  workout_ids: string[];
};

function readStatus(): WorkoutTourStatus {
  if (typeof window === "undefined") return "idle";
  const v = localStorage.getItem(STATUS_KEY);
  if (v === "seeded" || v === "completed") return v;
  return "idle";
}

function readSeedIds(): WorkoutSeedIds | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(IDS_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function useWorkoutTour() {
  const [status, setStatus] = useState<WorkoutTourStatus>("idle");
  const [everCompleted, setEverCompleted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStatus(readStatus());
    setEverCompleted(localStorage.getItem(EVER_DONE_KEY) === "true");
  }, []);

  const seed = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/tour/workouts/seed", { method: "POST", headers });
      if (!res.ok) {
        const text = await res.text().catch(() => "(unreadable)");
        console.error("Workout tour seed failed:", res.status, text.slice(0, 500));
        return false;
      }
      const data = await res.json();
      localStorage.setItem(STATUS_KEY, "seeded");
      localStorage.setItem(IDS_KEY, JSON.stringify(data.ids));
      setStatus("seeded");
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  const cleanup = useCallback(async () => {
    const ids = readSeedIds();
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/tour/workouts/cleanup", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch (e) {
      console.warn("Workout tour cleanup failed (non-blocking):", e);
    }
    localStorage.removeItem(STATUS_KEY);
    localStorage.removeItem(IDS_KEY);
    localStorage.setItem(EVER_DONE_KEY, "true");
    setStatus("completed");
    setEverCompleted(true);
  }, []);

  const devReset = useCallback(async () => {
    const ids = readSeedIds();
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/tour/workouts/cleanup", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {}
    localStorage.removeItem(STATUS_KEY);
    localStorage.removeItem(IDS_KEY);
    localStorage.removeItem(EVER_DONE_KEY);
    setStatus("idle");
    setEverCompleted(false);
  }, []);

  return { status, everCompleted, loading, seed, cleanup, devReset };
}
