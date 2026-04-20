"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OscType = OscillatorType;

export type SoundType = "tone" | "boxing-bell" | "air-horn" | "whistle" | "chime" | "buzzer";

export type AudioSettings = {
  enabled: boolean;
  soundType?: SoundType; // optional for backward compat, defaults to "tone"
  frequency: number;     // used by "tone" type
  oscType: OscType;      // used by "tone" type
};

export type TabataSplit = {
  id: string;
  name: string;
  warmup_seconds: number;
  rounds?: number;   // how many times to repeat the on/off cycle block (default 1)
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
  swStartTime: Date | null; // wall-clock time when timer was first started
  swPauseTime: Date | null; // wall-clock time of most recent pause
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
  tabNextPhase: () => void;
  tabPrevPhase: () => void;

  // Splits
  splits: TabataSplit[];
  saveSplit: (split: TabataSplit) => void;
  deleteSplit: (id: string) => void;
  reorderSplits: (fromIndex: number, toIndex: number) => void;
  importSplits: (json: string) => void;
  exportSplits: () => string;

  // Computed
  anyRunning: boolean;
  tabCompletedWorkCycles: number; // how many "on" phases have finished this run
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
  warmup_audio: { enabled: true, soundType: "tone", frequency: 440, oscType: "sine" },
  on_audio: { enabled: true, soundType: "boxing-bell", frequency: 880, oscType: "sine" },
  off_audio: { enabled: true, soundType: "buzzer", frequency: 330, oscType: "sine" },
  cooldown_audio: { enabled: true, soundType: "tone", frequency: 440, oscType: "sine" },
  done_audio: { enabled: true, soundType: "chime", frequency: 660, oscType: "sine" },
};

const STORAGE_KEY = "workout_timer_splits";
const SW_STORAGE_KEY = "workout_sw_state";
const HIIT_STORAGE_KEY = "workout_hiit_state";

// ─── Sound file map ─────────────────────────────────────────────────────────────
// Files go in /public/sounds/. If a file is missing, synthesis is used as fallback.

const SOUND_FILES: Partial<Record<SoundType, string>> = {
  "boxing-bell": "/sounds/boxing-bell.mp3",
  "air-horn":    "/sounds/air-horn.mp3",
  "whistle":     "/sounds/whistle.mp3",
  "chime":       "/sounds/chime.mp3",
  "buzzer":      "/sounds/buzzer.mp3",
};

// Maximum duration of each synthesized sound in seconds (used to schedule suspend)
const SYNTH_DURATIONS: Record<SoundType, number> = {
  "boxing-bell": 2.0,
  "air-horn":    1.3,
  "whistle":     0.65,
  "chime":       2.36, // 2.0 + 0.12 * 3 staggered notes
  "buzzer":      0.45,
  "tone":        0.5,
};

// ─── Shared AudioContext (persists across sounds for screen-off support) ─────────
// A single AudioContext is kept alive so we can call ctx.resume() before each
// sound — this works even when the screen is off on Android Chrome.
let _ctx: AudioContext | null = null;
const _bufferCache = new Map<string, AudioBuffer>();

function getCtx(): AudioContext {
  if (typeof window === "undefined") throw new Error("SSR");
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AudioContext();
    _bufferCache.clear(); // old buffers are invalid for a new context
  }
  return _ctx;
}


async function getBuffer(path: string): Promise<AudioBuffer | null> {
  if (_bufferCache.has(path)) return _bufferCache.get(path)!;
  try {
    const ctx = getCtx();
    const res = await fetch(path);
    const ab = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    _bufferCache.set(path, buf);
    return buf;
  } catch {
    return null;
  }
}

/** Call on user gesture to warm up the AudioContext and pre-fetch sound files. */
export function preloadSounds() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getCtx();
    ctx.resume().catch(() => {});
    for (const path of Object.values(SOUND_FILES)) {
      getBuffer(path as string);
    }
  } catch {}
}

// ─── Audio helpers ─────────────────────────────────────────────────────────────

function playOscTone(ctx: AudioContext, audio: AudioSettings) {
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
}

function playBoxingBell(ctx: AudioContext) {
  const dur = 2.0;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  const gain2 = ctx.createGain();
  osc1.connect(gain1); gain1.connect(ctx.destination);
  osc2.connect(gain2); gain2.connect(ctx.destination);
  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(920, ctx.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(820, ctx.currentTime + 0.15);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1380, ctx.currentTime);
  gain1.gain.setValueAtTime(0.7, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  gain2.gain.setValueAtTime(0.25, ctx.currentTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur * 0.5);
  osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + dur);
  osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + dur * 0.5);
}

function playAirHorn(ctx: AudioContext) {
  const dur = 1.3;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(215, ctx.currentTime);
  osc.frequency.setValueAtTime(228, ctx.currentTime + 0.06);
  osc.frequency.setValueAtTime(210, ctx.currentTime + 0.2);
  osc.frequency.setValueAtTime(222, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.5, ctx.currentTime + dur - 0.12);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
}

function playWhistle(ctx: AudioContext) {
  const dur = 0.65;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(2400, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(2650, ctx.currentTime + 0.15);
  osc.frequency.setValueAtTime(2500, ctx.currentTime + 0.45);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02);
  gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
}

function playChime(ctx: AudioContext) {
  const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  const dur = 2.0;
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    const t = ctx.currentTime + i * 0.12;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur);
  });
}

function playBuzzer(ctx: AudioContext) {
  const dur = 0.45;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(160, ctx.currentTime);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.setValueAtTime(0.3, ctx.currentTime + dur - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
}

function playSynthesized(soundType: SoundType, audio: AudioSettings, ctx: AudioContext) {
  switch (soundType) {
    case "boxing-bell": playBoxingBell(ctx); break;
    case "air-horn":    playAirHorn(ctx);    break;
    case "whistle":     playWhistle(ctx);    break;
    case "chime":       playChime(ctx);      break;
    case "buzzer":      playBuzzer(ctx);     break;
    default:            playOscTone(ctx, audio); break;
  }
}

// Debounced suspend: schedule a context suspend after a delay. Calling again
// cancels and reschedules, so back-to-back sounds never suspend mid-sequence.
let _suspendTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSuspend() {
  if (_suspendTimer !== null) clearTimeout(_suspendTimer);
  _suspendTimer = setTimeout(() => {
    _ctx?.suspend().catch(() => {});
    _suspendTimer = null;
  }, 1500);
}

export function playTone(audio: AudioSettings) {
  if (!audio.enabled) return;
  const soundType = audio.soundType ?? "tone";
  const filePath = SOUND_FILES[soundType];

  const run = async () => {
    // Cancel any pending suspend so the context stays alive for this sound
    if (_suspendTimer !== null) { clearTimeout(_suspendTimer); _suspendTimer = null; }
    let ctx: AudioContext;
    try { ctx = getCtx(); await ctx.resume(); } catch { return; }
    if (filePath) {
      const buf = await getBuffer(filePath);
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start();
        src.onended = scheduleSuspend;
        return;
      }
    }
    playSynthesized(soundType, audio, ctx);
    const dur = SYNTH_DURATIONS[soundType] ?? 0.5;
    setTimeout(scheduleSuspend, (dur + 0.1) * 1000);
  };

  run();
}

// ─── Phase logic (pure) ────────────────────────────────────────────────────────

type PhaseResult = {
  nextPhase: TabataPhase;
  nextCycle: number;
  nextDuration: number;
  audio: AudioSettings | null;
};

function computeNextPhase(phase: TabataPhase, cycle: number, split: TabataSplit): PhaseResult {
  let nextPhase: TabataPhase = "done";
  let nextCycle = cycle;
  let nextDuration = 0;
  let audio: AudioSettings | null = null;

  if (phase === "idle") {
    if (split.warmup_seconds > 0) {
      nextPhase = "warmup"; nextDuration = split.warmup_seconds; audio = split.warmup_audio;
    } else {
      nextPhase = "on"; nextCycle = 1; nextDuration = split.on_seconds; audio = split.on_audio;
    }
  } else if (phase === "warmup") {
    nextPhase = "on"; nextCycle = 1; nextDuration = split.on_seconds; audio = split.on_audio;
  } else if (phase === "on") {
    if (cycle < split.cycles * (split.rounds ?? 1)) {
      nextPhase = "off"; nextCycle = cycle; nextDuration = split.off_seconds; audio = split.off_audio;
    } else if (split.cooldown_seconds > 0) {
      nextPhase = "cooldown"; nextCycle = cycle; nextDuration = split.cooldown_seconds; audio = split.cooldown_audio;
    } else {
      nextPhase = "done"; audio = split.done_audio;
    }
  } else if (phase === "off") {
    nextPhase = "on"; nextCycle = cycle + 1; nextDuration = split.on_seconds; audio = split.on_audio;
  } else if (phase === "cooldown") {
    nextPhase = "done"; audio = split.done_audio;
  }

  return { nextPhase, nextCycle, nextDuration, audio };
}

function computePrevPhase(phase: TabataPhase, cycle: number, split: TabataSplit): PhaseResult | null {
  // Returns null if we should reset to idle
  if (phase === "warmup") return null;
  if (phase === "on") {
    if (cycle === 1) {
      if (split.warmup_seconds > 0) {
        return { nextPhase: "warmup", nextCycle: 0, nextDuration: split.warmup_seconds, audio: split.warmup_audio };
      }
      return null; // reset to idle
    }
    // cycle > 1: go back to off(cycle-1)
    return { nextPhase: "off", nextCycle: cycle - 1, nextDuration: split.off_seconds, audio: split.off_audio };
  }
  if (phase === "off") {
    return { nextPhase: "on", nextCycle: cycle, nextDuration: split.on_seconds, audio: split.on_audio };
  }
  if (phase === "cooldown") {
    return { nextPhase: "on", nextCycle: split.cycles, nextDuration: split.on_seconds, audio: split.on_audio };
  }
  return null;
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

  const reorderSplits = useCallback((fromIndex: number, toIndex: number) => {
    setSplits((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
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
  const swAccumulated = useRef(0);
  const swStartedAt = useRef<number | null>(null);
  const [swDisplay, setSwDisplay] = useState(0);
  const [swStartTime, setSwStartTime] = useState<Date | null>(null);
  const [swPauseTime, setSwPauseTime] = useState<Date | null>(null);
  // Refs so persistence callbacks can read the latest values without stale closures
  const swStartTimeRef = useRef<Date | null>(null);
  const swPauseTimeRef = useRef<Date | null>(null);

  // Restore persisted stopwatch time on mount (survives tab close / page refresh)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(SW_STORAGE_KEY);
      if (raw) {
        const { accumulated, startedAt, startTime, pauseTime } = JSON.parse(raw) as {
          accumulated: number; startedAt?: number; startTime?: string; pauseTime?: string;
        };
        // If tab closed while running, add elapsed time since then (restored as paused)
        const total = (typeof accumulated === "number" ? accumulated : 0)
          + (typeof startedAt === "number" ? (Date.now() - startedAt) / 1000 : 0);
        if (total > 0) {
          swAccumulated.current = total;
          setSwDisplay(Math.floor(total));
          // Re-save in paused form so startedAt doesn't keep accumulating on future mounts
          localStorage.setItem(SW_STORAGE_KEY, JSON.stringify({ accumulated: total, startTime, pauseTime }));
        }
        if (startTime) {
          const d = new Date(startTime);
          swStartTimeRef.current = d;
          setSwStartTime(d);
        }
        if (pauseTime) {
          const d = new Date(pauseTime);
          swPauseTimeRef.current = d;
          setSwPauseTime(d);
        }
      }
    } catch {}

    // Save running state when app is backgrounded/closed.
    // Use visibilitychange (fires on iOS PWA) + beforeunload (fires on desktop).
    const saveSwState = () => {
      try {
        if (swStartedAt.current != null) {
          const acc = swAccumulated.current + (Date.now() - swStartedAt.current) / 1000;
          localStorage.setItem(SW_STORAGE_KEY, JSON.stringify({
            accumulated: acc,
            startedAt: Date.now(),
            startTime: swStartTimeRef.current?.toISOString(),
            pauseTime: swPauseTimeRef.current?.toISOString(),
          }));
        }
      } catch {}
    };
    const handleVisibility = () => { if (document.visibilityState === "hidden") saveSwState(); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", saveSwState);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", saveSwState);
    };
  }, []);

  const swStart = useCallback(() => {
    preloadSounds(); // warm up AudioContext on first user gesture
    const isFirstStart = swAccumulated.current === 0 && swStartedAt.current == null;
    swStartedAt.current = Date.now();
    setSwRunning(true);
    if (isFirstStart) {
      const now = new Date();
      swStartTimeRef.current = now;
      setSwStartTime(now);
      // Persist the start time so it survives page reload
      try {
        const raw = localStorage.getItem(SW_STORAGE_KEY);
        const existing = raw ? JSON.parse(raw) : {};
        localStorage.setItem(SW_STORAGE_KEY, JSON.stringify({
          ...existing,
          startTime: now.toISOString(),
          pauseTime: null,
        }));
      } catch {}
    }
    swPauseTimeRef.current = null;
    setSwPauseTime(null);
  }, []);

  const swPause = useCallback(() => {
    if (swStartedAt.current != null) {
      swAccumulated.current += (Date.now() - swStartedAt.current) / 1000;
      swStartedAt.current = null;
    }
    const now = new Date();
    swPauseTimeRef.current = now;
    setSwRunning(false);
    setSwPauseTime(now);
    try {
      localStorage.setItem(SW_STORAGE_KEY, JSON.stringify({
        accumulated: swAccumulated.current,
        startTime: swStartTimeRef.current?.toISOString(),
        pauseTime: now.toISOString(),
      }));
    } catch {}
  }, []);

  const swReset = useCallback(() => {
    swAccumulated.current = 0;
    swStartedAt.current = null;
    swStartTimeRef.current = null;
    swPauseTimeRef.current = null;
    setSwRunning(false);
    setSwDisplay(0);
    setSwStartTime(null);
    setSwPauseTime(null);
    try { localStorage.removeItem(SW_STORAGE_KEY); } catch {}
  }, []);

  // ── Tabata ───────────────────────────────────────────────────────────────────
  const [tabRunning, setTabRunning] = useState(false);
  const [tabPhase, setTabPhase] = useState<TabataPhase>("idle");
  const [tabPhaseRemaining, setTabPhaseRemaining] = useState(0);
  const [tabCurrentCycle, setTabCurrentCycle] = useState(0);
  const [tabSelectedSplit, setTabSelectedSplit] = useState<TabataSplit | null>(null);

  const tabPhaseEndAt = useRef<number | null>(null);
  const tabPausedRemaining = useRef<number>(0);
  const tabPhaseRef = useRef<TabataPhase>("idle");
  const tabCycleRef = useRef(0);
  const tabSplitRef = useRef<TabataSplit | null>(null);
  const tabRunningRef = useRef(false);
  // Tracks which countdown seconds (3,2,1) have already played for the current phase
  const countdownFiredRef = useRef<Set<number>>(new Set());
  // Counts how many "on" phases have completed this run (for fill animation)
  const [tabCompletedWorkCycles, setTabCompletedWorkCycles] = useState(0);
  const tabCompletedWorkCyclesRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { tabPhaseRef.current = tabPhase; }, [tabPhase]);
  useEffect(() => { tabCycleRef.current = tabCurrentCycle; }, [tabCurrentCycle]);
  useEffect(() => { tabSplitRef.current = tabSelectedSplit; }, [tabSelectedSplit]);
  useEffect(() => { tabRunningRef.current = tabRunning; }, [tabRunning]);

  const tabSelectSplit = useCallback((split: TabataSplit) => {
    setTabSelectedSplit(split);
  }, []);

  // Internal helper to apply a phase transition (pause-aware)
  const applyPhase = useCallback((result: PhaseResult) => {
    const { nextPhase, nextCycle, nextDuration, audio } = result;
    countdownFiredRef.current = new Set();
    if (audio) playTone(audio);

    tabPhaseRef.current = nextPhase;
    tabCycleRef.current = nextCycle;
    setTabPhase(nextPhase);
    setTabCurrentCycle(nextCycle);

    if (nextPhase === "done") {
      tabPhaseEndAt.current = null;
      setTabRunning(false);
      setTabPhaseRemaining(0);
    } else {
      setTabPhaseRemaining(nextDuration);
      if (tabRunningRef.current) {
        tabPhaseEndAt.current = Date.now() + nextDuration * 1000;
      } else {
        tabPausedRemaining.current = nextDuration;
        tabPhaseEndAt.current = null;
      }
    }
  }, []);

  // Advance to the next phase (called by tick — always running)
  const advancePhase = useCallback(() => {
    const split = tabSplitRef.current;
    if (!split) return;
    const result = computeNextPhase(tabPhaseRef.current, tabCycleRef.current, split);
    // Track completed work cycles before transitioning
    if (tabPhaseRef.current === "on") {
      tabCompletedWorkCyclesRef.current += 1;
      setTabCompletedWorkCycles(tabCompletedWorkCyclesRef.current);
    }
    countdownFiredRef.current = new Set();
    if (result.audio) playTone(result.audio);

    tabPhaseRef.current = result.nextPhase;
    tabCycleRef.current = result.nextCycle;
    setTabPhase(result.nextPhase);
    setTabCurrentCycle(result.nextCycle);

    if (result.nextPhase === "done") {
      tabPhaseEndAt.current = null;
      setTabRunning(false);
      setTabPhaseRemaining(0);
    } else {
      tabPhaseEndAt.current = Date.now() + result.nextDuration * 1000;
      setTabPhaseRemaining(result.nextDuration);
    }
  }, []);

  // Manual next phase button (pause-aware)
  const tabNextPhase = useCallback(() => {
    const split = tabSplitRef.current;
    if (!split) return;
    const result = computeNextPhase(tabPhaseRef.current, tabCycleRef.current, split);
    // Count skipped "on" phases as completed so the fill animation stays correct
    if (tabPhaseRef.current === "on") {
      tabCompletedWorkCyclesRef.current += 1;
      setTabCompletedWorkCycles(tabCompletedWorkCyclesRef.current);
    }
    applyPhase(result);
  }, [applyPhase]);

  // Manual prev phase button (pause-aware)
  const tabPrevPhase = useCallback(() => {
    const split = tabSplitRef.current;
    if (!split) return;
    const result = computePrevPhase(tabPhaseRef.current, tabCycleRef.current, split);
    if (result === null) {
      // Reset to idle
      tabPhaseEndAt.current = null;
      tabPausedRemaining.current = 0;
      tabPhaseRef.current = "idle";
      tabCycleRef.current = 0;
      setTabRunning(false);
      setTabPhase("idle");
      setTabPhaseRemaining(0);
      setTabCurrentCycle(0);
    } else {
      applyPhase(result);
    }
  }, [applyPhase]);

  const tabStart = useCallback(() => {
    if (!tabSplitRef.current) return;
    preloadSounds(); // warm up AudioContext + pre-fetch sound files
    setTabPhase("idle");
    tabPhaseRef.current = "idle";
    setTabCurrentCycle(0);
    tabCycleRef.current = 0;
    tabPhaseEndAt.current = null;
    tabCompletedWorkCyclesRef.current = 0;
    setTabCompletedWorkCycles(0);
    tabRunningRef.current = true;
    setTabRunning(true);
    // Immediately advance from idle
    setTimeout(advancePhase, 0);
  }, [advancePhase]);

  const tabPause = useCallback(() => {
    if (tabPhaseEndAt.current != null) {
      tabPausedRemaining.current = Math.max(0, Math.ceil((tabPhaseEndAt.current - Date.now()) / 1000));
      tabPhaseEndAt.current = null;
    }
    tabRunningRef.current = false;
    setTabRunning(false);
    try {
      const split = tabSplitRef.current;
      if (split && tabPhaseRef.current !== "idle") {
        localStorage.setItem(HIIT_STORAGE_KEY, JSON.stringify({
          splitId: split.id, phase: tabPhaseRef.current,
          cycle: tabCycleRef.current, remaining: tabPausedRemaining.current,
        }));
      }
    } catch {}
  }, []);

  const tabResume = useCallback(() => {
    preloadSounds(); // ensure AudioContext is initialized after potential suspend
    if (tabPausedRemaining.current > 0) {
      tabPhaseEndAt.current = Date.now() + tabPausedRemaining.current * 1000;
    }
    tabRunningRef.current = true;
    setTabRunning(true);
  }, []);

  const tabReset = useCallback(() => {
    tabPhaseEndAt.current = null;
    tabPausedRemaining.current = 0;
    tabRunningRef.current = false;
    setTabRunning(false);
    setTabPhase("idle");
    tabPhaseRef.current = "idle";
    setTabPhaseRemaining(0);
    setTabCurrentCycle(0);
    tabCompletedWorkCyclesRef.current = 0;
    setTabCompletedWorkCycles(0);
    try { localStorage.removeItem(HIIT_STORAGE_KEY); } catch {}
  }, []);

  // ── HIIT state persistence ────────────────────────────────────────────────────
  // Restore paused HIIT state on mount (e.g. after tab close mid-session)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(HIIT_STORAGE_KEY);
      if (raw) {
        const { splitId, phase, cycle, remaining } = JSON.parse(raw) as {
          splitId: string; phase: TabataPhase; cycle: number; remaining: number;
        };
        const split = splits.find((s) => s.id === splitId);
        if (split && phase !== "idle" && phase !== "done" && remaining > 0) {
          setTabSelectedSplit(split);
          tabSplitRef.current = split;
          setTabPhase(phase);
          tabPhaseRef.current = phase;
          setTabCurrentCycle(cycle);
          tabCycleRef.current = cycle;
          tabPausedRemaining.current = remaining;
          setTabPhaseRemaining(remaining);
          // Restored as paused — user must tap Resume to continue
        }
      }
    } catch {}

    // Save running HIIT state when app is backgrounded/closed.
    const saveHiitState = () => {
      try {
        const split = tabSplitRef.current;
        const phase = tabPhaseRef.current;
        if (split && phase !== "idle" && phase !== "done" && tabRunningRef.current && tabPhaseEndAt.current != null) {
          const remaining = Math.max(0, Math.ceil((tabPhaseEndAt.current - Date.now()) / 1000));
          localStorage.setItem(HIIT_STORAGE_KEY, JSON.stringify({
            splitId: split.id, phase, cycle: tabCycleRef.current, remaining,
          }));
        }
      } catch {}
    };
    const handleHiitVisibility = () => { if (document.visibilityState === "hidden") saveHiitState(); };
    document.addEventListener("visibilitychange", handleHiitVisibility);
    window.addEventListener("beforeunload", saveHiitState);
    return () => {
      document.removeEventListener("visibilitychange", handleHiitVisibility);
      window.removeEventListener("beforeunload", saveHiitState);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splits]);

  // ── Unified tick interval ────────────────────────────────────────────────────
  const tickRef = useRef<() => void>(() => {});

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
          // 3-2-1 countdown beeps: short high-pitched tone, once per second
          if (remaining <= 3 && !countdownFiredRef.current.has(remaining)) {
            countdownFiredRef.current.add(remaining);
            playTone({ enabled: true, soundType: "tone", frequency: 1200, oscType: "sine" });
          }
          // 30-second warning beep during rest phase (only if rest > 30s)
          if (
            remaining === 30 &&
            tabPhaseRef.current === "off" &&
            (tabSplitRef.current?.off_seconds ?? 0) > 30 &&
            !countdownFiredRef.current.has(30)
          ) {
            countdownFiredRef.current.add(30);
            playTone({ enabled: true, soundType: "tone", frequency: 880, oscType: "sine" });
          }
        }
      }
    };
  }, [advancePhase]);

  useEffect(() => {
    const id = setInterval(() => tickRef.current(), 100);
    return () => clearInterval(id);
  }, []);

  // ── Wake lock ────────────────────────────────────────────────────────────────
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const anyRunning = swRunning || tabRunning;

  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    const requestWakeLock = () => {
      if (document.visibilityState === "visible") {
        navigator.wakeLock.request("screen").then((sentinel) => {
          wakeLockRef.current = sentinel;
        }).catch(() => {});
      }
    };

    if (anyRunning) {
      requestWakeLock();
      // Re-acquire when tab becomes visible again (wake lock is auto-released on hide)
      document.addEventListener("visibilitychange", requestWakeLock);
      return () => document.removeEventListener("visibilitychange", requestWakeLock);
    } else {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, [anyRunning]);

  // Resume AudioContext when tab becomes visible (e.g. user wakes screen).
  // iOS may suspend the context on screen-off; this recovers it when the screen comes back on.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && tabRunningRef.current && _ctx) {
        _ctx.resume().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return {
    swRunning,
    swDisplay,
    swStartTime,
    swPauseTime,
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
    tabNextPhase,
    tabPrevPhase,

    splits,
    saveSplit,
    deleteSplit,
    reorderSplits,
    importSplits,
    exportSplits,

    anyRunning,
    tabCompletedWorkCycles,
  };
}
