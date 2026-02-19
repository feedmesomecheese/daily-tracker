"use client";
import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";

export type TourStatus = "idle" | "seeded" | "completed";

const STORAGE_KEY = "tour_status_today";

function readStatus(): TourStatus {
  if (typeof window === "undefined") return "idle";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "seeded" || v === "completed") return v;
  return "idle";
}

function writeStatus(s: TourStatus) {
  if (typeof window === "undefined") return;
  if (s === "idle") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, s);
  }
}

export function useTour() {
  const [status, setStatus] = useState<TourStatus>("idle");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStatus(readStatus());
  }, []);

  // Seed demo data. Returns true if successful.
  const seed = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/tour/seed", { method: "POST", headers });
      if (!res.ok) {
        const text = await res.text().catch(() => "(unreadable)");
        console.error("Tour seed failed:", res.status, text.slice(0, 500));
        return false;
      }
      writeStatus("seeded");
      setStatus("seeded");
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  const cleanup = useCallback(async (navigateTo?: string) => {
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/tour/cleanup", { method: "POST", headers });
    } catch (e) {
      console.warn("Tour cleanup failed (non-blocking):", e);
    }
    writeStatus("completed");
    setStatus("completed");
    if (navigateTo) {
      window.location.href = navigateTo;
    }
  }, []);

  const reset = useCallback(() => {
    writeStatus("idle");
    setStatus("idle");
  }, []);

  // Dev-only: delete demo data from DB and reset to idle in one shot.
  const devReset = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/tour/cleanup", { method: "POST", headers });
    } catch (e) {
      console.warn("Tour devReset cleanup failed:", e);
    }
    writeStatus("idle");
    setStatus("idle");
  }, []);

  return { status, loading, seed, cleanup, reset, devReset };
}
