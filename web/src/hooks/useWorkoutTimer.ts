"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OscType = OscillatorType;

export type AudioSettings = {
  enabled: boolean;
  frequency: number;
  oscType: OscType;
};

export type TabataSplit = {
  id: string;
  name: string;
  warmup_seconds: number;
  cycles: number;
  on_seconds: number;
  off_seconds: number;
  cooldown_seconds: number;
  warmup_color: string;
  on_color: string;
  off_color: string;
  cooldown_color: string;
  warmup_audio: AudioSettings;
  on_audio: AudioSettings;
  off_audio: AudioSettings;
  cooldown_audio: AudioSettings;
  done_audio: AudioSettings;
};

export type TabataPhase = "idle" | "warmup" | "on" | "off" | "cooldown" | "done";

export type WorkoutTimerState = {
  // Stopwatch
  swRunning: boolean;
  swDisplay: number; // total elapsed seconds
  swStart: () => void;
  swPause: () => void;
  swReset: () => void;

  // Tabata
  tabRunning: boolean;
  tabPhase: TabataPhase;
  tabPhaseRemaining: number; // seconds remaining in current phase
  tabCurrentCycle: number;   // 1-indexed
  tabSelectedSplit: TabataSplit | null;
  tabSelectSplit: (split: TabataSplit) => void;
  tabStart: () => void;
  tabPause: () => void;
  tabResume: () => void;
  tabReset: () => void;

  // Splits
  splits: TabataSplit[];
  saveSplit: (split: TabataSplit) => void;
  deleteSplit: (id: string) => void;
  importSplits: (json: string) => void;
  exportSplits: () => string;

  // Computed
  anyRunning: boolean;
};

// ─── Default split ─────────────────────────────────────────────────────────────

const DEFAULT_SPLIT: TabataSplit = {
  id: "classic-tabata",
  name: "Classic Tabata",
  warmup_seconds: 0,
  cycles: 8,
  on_seconds: 20,
  off_seconds: 10,
  cooldown_seconds: 0,
  warmup_color: "#3b82f6",
  on_color: "#22c55e",
  off_color: "#ef4444",
  cooldown_color: "#a855f7",
  warmup_audio: { enabled: true, frequency: 440, oscType: "sine" },
  on_audio: { enabled: true, frequency: 880, oscType: "sine" },
  off_audio: { enabled: true, frequency: 330, oscType: "sine" },
  cooldown_audio: { enabled: true, frequency: 440, oscType: "sine" },
  done_audio: { enabled: true, frequency: 660, oscType: "sine" },
};

const STORAGE_KEY = "workout_timer_splits";

// ─── Audio helper ──────────────────────────────────────────────────────────────

export function playTone(audio: AudioSettings) {
  if (!audio.enabled) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = audio.oscType;
    osc.frequency.setValueAtTime(audio.frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    // Web Audio not available (SSR, etc.)
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkoutTimer(): WorkoutTimerState {
  // ── Splits ──────────────────────────────────────────────────────────────────
  const [splits, setSplits] = useState<TabataSplit[]>(() => {
    if (typeof window === "undefined") return [DEFAULT_SPLIT];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as TabataSplit[];
    } catch {}
    return [DEFAULT_SPLIT];
  });

  const persistSplits = useCallback((next: TabataSplit[]) => {
    setSplits(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const saveSplit = useCallback((split: TabataSplit) => {
    setSplits((prev) => {
      const idx = prev.findIndex((s) => s.id === split.id);
      const next = idx >= 0
        ? prev.map((s) => (s.id === split.id ? split : s))
        : [...prev, split];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const deleteSplit = useCallback((id: string) => {
    setSplits((prev) => {
      const next = prev.filter((s) => s.id !== id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const importSplits = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as TabataSplit[];
      if (Array.isArray(parsed)) persistSplits(parsed);
    } catch {}
  }, [persistSplits]);

  const exportSplits = useCallback((): string => {
    return JSON.stringify(splits, null, 2);
  }, [splits]);

  // ── Stopwatch ────────────────────────────────────────────────────────────────
  const [swRunning, setSwRunning] = useState(false);
  const swAccumulated = useRef(0); // seconds accumulated before current start
  const swStartedAt = useRef<number | null>(null); // Date.now() when last started
  const [swDisplay, setSwDisplay] = useState(0);

  const swStart = useCallback(() => {
    swStartedAt.current = Date.now();
    setSwRunning(true);
  }, []);

  const swPause = useCallback(() => {
    if (swStartedAt.current != null) {
      swAccumulated.current += (Date.now() - swStartedAt.current) / 1000;
      swStartedAt.current = null;
    }
    setSwRunning(false);
  }, []);

  const swReset = useCallback(() => {
    swAccumulated.current = 0;
    swStartedAt.current = null;
    setSwRunning(false);
    setSwDisplay(0);
  }, []);

  // ── Tabata ───────────────────────────────────────────────────────────────────
  const [tabRunning, setTabRunning] = useState(false);
  const [tabPhase, setTabPhase] = useState<TabataPhase>("idle");
  const [tabPhaseRemaining, setTabPhaseRemaining] = useState(0);
  const [tabCurrentCycle, setTabCurrentCycle] = useState(0);
  const [tabSelectedSplit, setTabSelectedSplit] = useState<TabataSplit | null>(null);

  const tabPhaseEndAt = useRef<number | null>(null); // absolute ms
  const tabPausedRemaining = useRef<number>(0);       // seconds remaining when paused
  const tabPhaseRef = useRef<TabataPhase>("idle");
  const tabCycleRef = useRef(0);
  const tabSplitRef = useRef<TabataSplit | null>(null);

  // Keep refs in sync
  useEffect(() => { tabPhaseRef.current = tabPhase; }, [tabPhase]);
  useEffect(() => { tabCycleRef.current = tabCurrentCycle; }, [tabCurrentCycle]);
  useEffect(() => { tabSplitRef.current = tabSelectedSplit; }, [tabSelectedSplit]);

  const tabSelectSplit = useCallback((split: TabataSplit) => {
    setTabSelectedSplit(split);
  }, []);

  // Advance to the next phase
  const advancePhase = useCallback(() => {
    const split = tabSplitRef.current;
    if (!split) return;

    const phase = tabPhaseRef.current;
    const cycle = tabCycleRef.current;

    let nextPhase: TabataPhase = "done";
    let nextCycle = cycle;
    let nextDuration = 0;
    let audioToPlay: AudioSettings | null = null;

    if (phase === "idle") {
      if (split.warmup_seconds > 0) {
        nextPhase = "warmup";
        nextDuration = split.warmup_seconds;
        audioToPlay = split.warmup_audio;
      } else {
        nextPhase = "on";
        nextCycle = 1;
        nextDuration = split.on_seconds;
        audioToPlay = split.on_audio;
      }
    } else if (phase === "warmup") {
      nextPhase = "on";
      nextCycle = 1;
      nextDuration = split.on_seconds;
      audioToPlay = split.on_audio;
    } else if (phase === "on") {
      if (cycle < split.cycles) {
        nextPhase = "off";
        nextCycle = cycle;
        nextDuration = split.off_seconds;
        audioToPlay = split.off_audio;
      } else if (split.cooldown_seconds > 0) {
        nextPhase = "cooldown";
        nextCycle = cycle;
        nextDuration = split.cooldown_seconds;
        audioToPlay = split.cooldown_audio;
      } else {
        nextPhase = "done";
        audioToPlay = split.done_audio;
      }
    } else if (phase === "off") {
      nextPhase = "on";
      nextCycle = cycle + 1;
      nextDuration = split.on_seconds;
      audioToPlay = split.on_audio;
    } else if (phase === "cooldown") {
      nextPhase = "done";
      audioToPlay = split.done_audio;
    }

    if (audioToPlay) playTone(audioToPlay);

    if (nextPhase === "done") {
      tabPhaseEndAt.current = null;
      setTabRunning(false);
      setTabPhase("done");
      setTabPhaseRemaining(0);
      setTabCurrentCycle(nextCycle);
    } else {
      tabPhaseEndAt.current = Date.now() + nextDuration * 1000;
      setTabPhase(nextPhase);
      setTabCurrentCycle(nextCycle);
      setTabPhaseRemaining(nextDuration);
    }
  }, []);

  const tabStart = useCallback(() => {
    if (!tabSplitRef.current) return;
    setTabPhase("idle");
    tabPhaseRef.current = "idle";
    setTabCurrentCycle(0);
    tabCycleRef.current = 0;
    tabPhaseEndAt.current = null;
    setTabRunning(true);
    // Immediately advance from idle
    setTimeout(advancePhase, 0);
  }, [advancePhase]);

  const tabPause = useCallback(() => {
    if (tabPhaseEndAt.current != null) {
      tabPausedRemaining.current = Math.max(0, Math.ceil((tabPhaseEndAt.current - Date.now()) / 1000));
      tabPhaseEndAt.current = null;
    }
    setTabRunning(false);
  }, []);

  const tabResume = useCallback(() => {
    if (tabPausedRemaining.current > 0) {
      tabPhaseEndAt.current = Date.now() + tabPausedRemaining.current * 1000;
    }
    setTabRunning(true);
  }, []);

  const tabReset = useCallback(() => {
    tabPhaseEndAt.current = null;
    tabPausedRemaining.current = 0;
    setTabRunning(false);
    setTabPhase("idle");
    setTabPhaseRemaining(0);
    setTabCurrentCycle(0);
  }, []);

  // ── Unified tick interval ────────────────────────────────────────────────────
  const tickRef = useRef<() => void>(() => {});

  // Keep tickRef up-to-date with latest closure
  useEffect(() => {
    tickRef.current = () => {
      const now = Date.now();

      // Stopwatch tick
      if (swStartedAt.current != null) {
        const elapsed = swAccumulated.current + (now - swStartedAt.current) / 1000;
        setSwDisplay(Math.floor(elapsed));
      }

      // Tabata tick
      if (tabPhaseEndAt.current != null) {
        const remaining = Math.ceil((tabPhaseEndAt.current - now) / 1000);
        if (remaining <= 0) {
          advancePhase();
        } else {
          setTabPhaseRemaining(remaining);
        }
      }
    };
  }, [advancePhase]);

  // Single interval drives both timers
  useEffect(() => {
    const id = setInterval(() => tickRef.current(), 100);
    return () => clearInterval(id);
  }, []);

  // ── Wake lock ────────────────────────────────────────────────────────────────
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const anyRunning = swRunning || tabRunning;

  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    if (anyRunning) {
      navigator.wakeLock.request("screen").then((sentinel) => {
        wakeLockRef.current = sentinel;
      }).catch(() => {});
    } else {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, [anyRunning]);

  return {
    swRunning,
    swDisplay,
    swStart,
    swPause,
    swReset,

    tabRunning,
    tabPhase,
    tabPhaseRemaining,
    tabCurrentCycle,
    tabSelectedSplit,
    tabSelectSplit,
    tabStart,
    tabPause,
    tabResume,
    tabReset,

    splits,
    saveSplit,
    deleteSplit,
    importSplits,
    exportSplits,

    anyRunning,
  };
}
