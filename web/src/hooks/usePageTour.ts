"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * Lightweight tour state hook for informational (no demo data) tours.
 * Tracks whether the user has completed the tour for a given page.
 *
 * Usage:
 *   const { completed, complete, devReset } = usePageTour("books");
 */
export function usePageTour(page: string) {
  const [completed, setCompleted] = useState(false);
  const key = `tour_${page}_completed`;

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCompleted(localStorage.getItem(key) === "true");
    }
  }, [key]);

  const complete = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, "true");
    }
    setCompleted(true);
  }, [key]);

  const devReset = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(key);
    }
    setCompleted(false);
  }, [key]);

  return { completed, complete, devReset };
}
