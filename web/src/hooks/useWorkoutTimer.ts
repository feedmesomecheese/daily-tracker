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

export type CountUpPreset = {
  id: string;
  name: string;
  goal_seconds: number;
  interval_seconds: number;
  interval_audio: AudioSettings;
  goal_audio: AudioSettings;
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

  // Count-up
  cuRunning: boolean;
  cuElapsed: number;
  cuGoalReached: boolean;
  cuSelectedPreset: CountUpPreset | null;
  cuSelectPreset: (preset: CountUpPreset) => void;
  cuStart: () => void;
  cuPause: () => void;
  cuResume: () => void;
  cuReset: () => void;
  cuPresets: CountUpPreset[];
  cuSavePreset: (preset: CountUpPreset) => void;
  cuDeletePreset: (id: string) => void;
  cuReorderPresets: (from: number, to: number) => void;
  cuImportPresets: (json: string) => void;
  cuExportPresets: () => string;

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
const CU_PRESETS_KEY = "workout_cu_presets";
const CU_STATE_KEY = "workout_cu_state";

const DEFAULT_CU_PRESET: CountUpPreset = {
  id: "default-countup",
  name: "Plank",
  goal_seconds: 60,
  interval_seconds: 15,
  interval_audio: { enabled: true, soundType: "tone", frequency: 880, oscType: "sine" },
  goal_audio: { enabled: true, soundType: "chime", frequency: 660, oscType: "sine" },
};

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
    // Resume immediately if another audio app suspends our context while HIIT is running.
    _ctx.addEventListener("statechange", () => {
      if (_ctx?.state === "suspended" && _hiitActive) {
        _ctx.resume().catch(() => {});
      }
    });
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

function playOscTone(ctx: AudioContext, audio: AudioSettings, t = ctx.currentTime) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = audio.oscType;
  osc.frequency.setValueAtTime(audio.frequency, t);
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.start(t);
  osc.stop(t + 0.5);
}

function playBoxingBell(ctx: AudioContext, t = ctx.currentTime) {
  const dur = 2.0;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  const gain2 = ctx.createGain();
  osc1.connect(gain1); gain1.connect(ctx.destination);
  osc2.connect(gain2); gain2.connect(ctx.destination);
  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(920, t);
  osc1.frequency.exponentialRampToValueAtTime(820, t + 0.15);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1380, t);
  gain1.gain.setValueAtTime(0.7, t);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + dur);
  gain2.gain.setValueAtTime(0.25, t);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.5);
  osc1.start(t); osc1.stop(t + dur);
  osc2.start(t); osc2.stop(t + dur * 0.5);
}

function playAirHorn(ctx: AudioContext, t = ctx.currentTime) {
  const dur = 1.3;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(215, t);
  osc.frequency.setValueAtTime(228, t + 0.06);
  osc.frequency.setValueAtTime(210, t + 0.2);
  osc.frequency.setValueAtTime(222, t + 0.4);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.5, t + 0.05);
  gain.gain.setValueAtTime(0.5, t + dur - 0.12);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t); osc.stop(t + dur);
}

function playWhistle(ctx: AudioContext, t = ctx.currentTime) {
  const dur = 0.65;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(2400, t);
  osc.frequency.linearRampToValueAtTime(2650, t + 0.15);
  osc.frequency.setValueAtTime(2500, t + 0.45);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.4, t + 0.02);
  gain.gain.setValueAtTime(0.4, t + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t); osc.stop(t + dur);
}

function playChime(ctx: AudioContext, t = ctx.currentTime) {
  const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  const dur = 2.0;
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    const st = t + i * 0.12;
    osc.frequency.setValueAtTime(freq, st);
    gain.gain.setValueAtTime(0, st);
    gain.gain.linearRampToValueAtTime(0.3, st + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, st + dur);
    osc.start(st); osc.stop(st + dur);
  });
}

function playBuzzer(ctx: AudioContext, t = ctx.currentTime) {
  const dur = 0.45;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(160, t);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.setValueAtTime(0.3, t + dur - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t); osc.stop(t + dur);
}

function playSynthesized(soundType: SoundType, audio: AudioSettings, ctx: AudioContext, t = ctx.currentTime) {
  switch (soundType) {
    case "boxing-bell": playBoxingBell(ctx, t); break;
    case "air-horn":    playAirHorn(ctx, t);    break;
    case "whistle":     playWhistle(ctx, t);    break;
    case "chime":       playChime(ctx, t);      break;
    case "buzzer":      playBuzzer(ctx, t);     break;
    default:            playOscTone(ctx, audio, t); break;
  }
}

// ─── HIIT pre-scheduling ────────────────────────────────────────────────────────
// Sounds are scheduled ahead of time using the Web Audio API timeline so they
// fire even when JS is throttled (screen off, backgrounded app).
//
// All pre-scheduled sounds are routed through a single session GainNode.
// Cancellation disconnects that node — instantly silences everything through it
// regardless of individual node state, which is more reliable than stop(0) alone.

let _hiitActive = false;
let _hiitSessionGain: GainNode | null = null;
type StoppableNode = { stop: (when?: number) => void };
const _scheduledHiitNodes: StoppableNode[] = [];

function cancelHiitSchedule() {
  // Disconnect session gain — immediately silences all sounds routed through it.
  if (_hiitSessionGain) {
    try { _hiitSessionGain.disconnect(); } catch {}
    _hiitSessionGain = null;
  }
  // Belt-and-suspenders: also stop individual nodes.
  for (const node of _scheduledHiitNodes) {
    try { node.stop(0); } catch {}
  }
  _scheduledHiitNodes.length = 0;
}

function scheduleHiitSoundAt(ctx: AudioContext, audio: AudioSettings, when: number) {
  if (!audio.enabled) return;
  const dest: AudioNode = _hiitSessionGain ?? ctx.destination;
  const soundType = audio.soundType ?? "tone";

  // Prefer file-based buffer (pre-loaded by preloadSounds).
  const filePath = SOUND_FILES[soundType];
  if (filePath) {
    const buf = _bufferCache.get(filePath);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8, when);
      src.connect(gain);
      gain.connect(dest);
      src.start(when);
      _scheduledHiitNodes.push(src);
      return;
    }
    // Buffer not yet loaded — fall through to synth
  }

  if (soundType === "tone") {
    // Simple beep via OscillatorNode — stored for cancellation.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = audio.oscType ?? "sine";
    osc.connect(gain);
    gain.connect(dest);
    osc.frequency.setValueAtTime(audio.frequency ?? 440, when);
    gain.gain.setValueAtTime(0.4, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    osc.start(when);
    osc.stop(when + 0.5);
    _scheduledHiitNodes.push(osc);
    return;
  }

  // Complex synth fallback (rare — only if buffer not yet cached).
  // Goes to dest so it's still silenced if session gain is disconnected.
  playSynthesized(soundType, audio, ctx, when);
}

function scheduleAllHiitSounds(
  split: TabataSplit,
  phase: TabataPhase,
  cycle: number,
  phaseEndAt: number  // Date.now() ms when this phase ends
) {
  cancelHiitSchedule(); // disconnects old session gain, clears node list
  if (typeof window === "undefined") return;
  let ctx: AudioContext;
  try { ctx = getCtx(); } catch { return; }

  if (_suspendTimer !== null) { clearTimeout(_suspendTimer); _suspendTimer = null; }

  // Fresh session gain — all sounds in this schedule route through it.
  // Cancelling the next session will disconnect this gain and silence them instantly.
  _hiitSessionGain = ctx.createGain();
  _hiitSessionGain.connect(ctx.destination);

  const nowMs = Date.now();
  const nowAudio = ctx.currentTime;
  const toAudio = (ms: number) => nowAudio + Math.max(0, (ms - nowMs) / 1000);

  let curPhase = phase;
  let curCycle = cycle;
  let curEndMs = phaseEndAt;
  let guard = 0;

  while (curPhase !== "done" && curPhase !== "idle" && guard++ < 300) {
    // Countdown beeps (3, 2, 1) before each phase ends
    for (const cd of [3, 2, 1]) {
      const beepMs = curEndMs - cd * 1000;
      if (beepMs > nowMs) {
        scheduleHiitSoundAt(ctx, { enabled: true, soundType: "tone", frequency: 1200, oscType: "sine" }, toAudio(beepMs));
      }
    }

    // 30-second warning during rest phases longer than 30s
    if (curPhase === "off" && (split.off_seconds ?? 0) > 30) {
      const warnMs = curEndMs - 30 * 1000;
      if (warnMs > nowMs) {
        scheduleHiitSoundAt(ctx, { enabled: true, soundType: "tone", frequency: 880, oscType: "sine" }, toAudio(warnMs));
      }
    }

    const result = computeNextPhase(curPhase, curCycle, split);

    // Transition sound fires at the end of curPhase (= start of next)
    if (result.audio && curEndMs > nowMs) {
      scheduleHiitSoundAt(ctx, result.audio, toAudio(curEndMs));
    }

    curPhase = result.nextPhase;
    curCycle = result.nextCycle;
    if (curPhase === "done" || result.nextDuration <= 0) break;
    curEndMs = curEndMs + result.nextDuration * 1000;
  }
}

// Debounced suspend: schedule a context suspend after a delay. Calling again
// cancels and reschedules, so back-to-back sounds never suspend mid-sequence.
// Skipped while HIIT is running so pre-scheduled sounds can fire uninterrupted.
let _suspendTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSuspend() {
  if (_hiitActive) return;
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

  // ── Count-up presets ─────────────────────────────────────────────────────────
  const [cuPresetsState, setCuPresetsState] = useState<CountUpPreset[]>(() => {
    if (typeof window === "undefined") return [DEFAULT_CU_PRESET];
    try {
      const raw = localStorage.getItem(CU_PRESETS_KEY);
      if (raw) return JSON.parse(raw) as CountUpPreset[];
    } catch {}
    return [DEFAULT_CU_PRESET];
  });

  const persistCuPresets = useCallback((next: CountUpPreset[]) => {
    setCuPresetsState(next);
    try { localStorage.setItem(CU_PRESETS_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const cuSavePreset = useCallback((preset: CountUpPreset) => {
    setCuPresetsState((prev) => {
      const idx = prev.findIndex((p) => p.id === preset.id);
      const next = idx >= 0 ? prev.map((p) => (p.id === preset.id ? preset : p)) : [...prev, preset];
      try { localStorage.setItem(CU_PRESETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const cuDeletePreset = useCallback((id: string) => {
    setCuPresetsState((prev) => {
      const next = prev.filter((p) => p.id !== id);
      try { localStorage.setItem(CU_PRESETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const cuReorderPresets = useCallback((fromIndex: number, toIndex: number) => {
    setCuPresetsState((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      try { localStorage.setItem(CU_PRESETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const cuImportPresets = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as CountUpPreset[];
      if (Array.isArray(parsed)) persistCuPresets(parsed);
    } catch {}
  }, [persistCuPresets]);

  const cuExportPresets = useCallback((): string => {
    return JSON.stringify(cuPresetsState, null, 2);
  }, [cuPresetsState]);

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

  // Internal helper to apply a phase transition (pause-aware, used by manual next/prev).
  const applyPhase = useCallback((result: PhaseResult) => {
    cancelHiitSchedule();
    const { nextPhase, nextCycle, nextDuration, audio } = result;
    countdownFiredRef.current = new Set();
    if (audio) playTone(audio);

    tabPhaseRef.current = nextPhase;
    tabCycleRef.current = nextCycle;
    setTabPhase(nextPhase);
    setTabCurrentCycle(nextCycle);

    if (nextPhase === "done") {
      tabPhaseEndAt.current = null;
      tabRunningRef.current = false;
      _hiitActive = false;
      setTabRunning(false);
      setTabPhaseRemaining(0);
    } else {
      setTabPhaseRemaining(nextDuration);
      if (tabRunningRef.current) {
        const endAt = Date.now() + nextDuration * 1000;
        tabPhaseEndAt.current = endAt;
        scheduleAllHiitSounds(tabSplitRef.current!, nextPhase, nextCycle, endAt);
      } else {
        tabPausedRemaining.current = nextDuration;
        tabPhaseEndAt.current = null;
      }
    }
  }, []);

  // Advance to the next phase (called by tick — always running).
  // Transition sounds are pre-scheduled via scheduleAllHiitSounds; this only
  // updates state and re-schedules remaining sounds for the new phase.
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

    tabPhaseRef.current = result.nextPhase;
    tabCycleRef.current = result.nextCycle;
    setTabPhase(result.nextPhase);
    setTabCurrentCycle(result.nextCycle);

    if (result.nextPhase === "done") {
      tabPhaseEndAt.current = null;
      tabRunningRef.current = false;
      _hiitActive = false;
      setTabRunning(false);
      setTabPhaseRemaining(0);
      cancelHiitSchedule();
    } else {
      tabPhaseEndAt.current = Date.now() + result.nextDuration * 1000;
      setTabPhaseRemaining(result.nextDuration);
      // Re-schedule remaining sounds starting from the new phase
      scheduleAllHiitSounds(split, result.nextPhase, result.nextCycle, tabPhaseEndAt.current);
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
    // Going back through "off" or "cooldown" means un-completing the "on" phase that preceded it
    if (tabPhaseRef.current === "off" || tabPhaseRef.current === "cooldown") {
      const newCompleted = Math.max(0, tabCompletedWorkCyclesRef.current - 1);
      tabCompletedWorkCyclesRef.current = newCompleted;
      setTabCompletedWorkCycles(newCompleted);
    }
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
    cancelHiitSchedule();
    _hiitActive = true;
    setTabPhase("idle");
    tabPhaseRef.current = "idle";
    setTabCurrentCycle(0);
    tabCycleRef.current = 0;
    tabPhaseEndAt.current = null;
    tabCompletedWorkCyclesRef.current = 0;
    setTabCompletedWorkCycles(0);
    tabRunningRef.current = true;
    setTabRunning(true);
    // Play the first phase's start sound immediately (advancePhase only schedules
    // sounds from the phase-end onward, so the initial sound would otherwise be missed).
    const firstResult = computeNextPhase("idle", 0, tabSplitRef.current);
    if (firstResult.audio) playTone(firstResult.audio);
    // Advance from idle; advancePhase sets state and calls scheduleAllHiitSounds
    setTimeout(advancePhase, 0);
  }, [advancePhase]);

  const tabPause = useCallback(() => {
    cancelHiitSchedule();
    _hiitActive = false;
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
    _hiitActive = true;
    if (tabPausedRemaining.current > 0) {
      tabPhaseEndAt.current = Date.now() + tabPausedRemaining.current * 1000;
    }
    tabRunningRef.current = true;
    setTabRunning(true);
    // Re-schedule all remaining sounds from the current phase
    const split = tabSplitRef.current;
    const phase = tabPhaseRef.current;
    const cycle = tabCycleRef.current;
    if (split && phase !== "idle" && phase !== "done" && tabPhaseEndAt.current != null) {
      scheduleAllHiitSounds(split, phase, cycle, tabPhaseEndAt.current);
    }
  }, []);

  const tabReset = useCallback(() => {
    cancelHiitSchedule();
    _hiitActive = false;
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

  // ── Count-up timer ───────────────────────────────────────────────────────────
  const [cuRunning, setCuRunning] = useState(false);
  const [cuElapsed, setCuElapsed] = useState(0);
  const [cuGoalReached, setCuGoalReached] = useState(false);
  const [cuSelectedPreset, setCuSelectedPreset] = useState<CountUpPreset | null>(null);

  const cuStartedAt = useRef<number | null>(null);
  const cuAccumulated = useRef<number>(0);
  const cuGoalFiredRef = useRef<boolean>(false);
  const cuLastElapsedTickRef = useRef<number>(0);
  const cuRunningRef = useRef<boolean>(false);
  const cuPresetRef = useRef<CountUpPreset | null>(null);

  useEffect(() => { cuRunningRef.current = cuRunning; }, [cuRunning]);
  useEffect(() => { cuPresetRef.current = cuSelectedPreset; }, [cuSelectedPreset]);

  const cuSelectPreset = useCallback((preset: CountUpPreset) => {
    setCuSelectedPreset(preset);
    cuPresetRef.current = preset;
  }, []);

  const cuStart = useCallback(() => {
    preloadSounds();
    cuAccumulated.current = 0;
    cuStartedAt.current = Date.now();
    cuGoalFiredRef.current = false;
    cuLastElapsedTickRef.current = 0;
    setCuGoalReached(false);
    setCuElapsed(0);
    cuRunningRef.current = true;
    setCuRunning(true);
  }, []);

  const cuPause = useCallback(() => {
    if (cuStartedAt.current != null) {
      cuAccumulated.current += (Date.now() - cuStartedAt.current) / 1000;
      cuStartedAt.current = null;
    }
    cuRunningRef.current = false;
    setCuRunning(false);
  }, []);

  const cuResume = useCallback(() => {
    preloadSounds();
    cuStartedAt.current = Date.now();
    cuRunningRef.current = true;
    setCuRunning(true);
  }, []);

  const cuReset = useCallback(() => {
    cuAccumulated.current = 0;
    cuStartedAt.current = null;
    cuGoalFiredRef.current = false;
    cuLastElapsedTickRef.current = 0;
    cuRunningRef.current = false;
    setCuRunning(false);
    setCuElapsed(0);
    setCuGoalReached(false);
    try { localStorage.removeItem(CU_STATE_KEY); } catch {}
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

  // ── Count-up persistence ─────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(CU_STATE_KEY);
      if (raw) {
        const { presetId, accumulated, startedAt } = JSON.parse(raw);
        const preset = cuPresetsState.find((p) => p.id === presetId);
        if (preset && typeof accumulated === "number") {
          const total = accumulated + (typeof startedAt === "number" ? (Date.now() - startedAt) / 1000 : 0);
          cuAccumulated.current = total;
          setCuElapsed(total);
          cuGoalFiredRef.current = preset.goal_seconds > 0 && total >= preset.goal_seconds;
          if (cuGoalFiredRef.current) setCuGoalReached(true);
          cuLastElapsedTickRef.current = Math.floor(total);
          setCuSelectedPreset(preset);
          cuPresetRef.current = preset;
          localStorage.setItem(CU_STATE_KEY, JSON.stringify({ presetId, accumulated: total }));
        }
      }
    } catch {}

    const saveCuState = () => {
      try {
        const preset = cuPresetRef.current;
        if (preset && cuRunningRef.current && cuStartedAt.current != null) {
          const acc = cuAccumulated.current + (Date.now() - cuStartedAt.current) / 1000;
          localStorage.setItem(CU_STATE_KEY, JSON.stringify({
            presetId: preset.id,
            accumulated: acc,
            startedAt: Date.now(),
          }));
        }
      } catch {}
    };
    const handleCuVisibility = () => { if (document.visibilityState === "hidden") saveCuState(); };
    document.addEventListener("visibilitychange", handleCuVisibility);
    window.addEventListener("beforeunload", saveCuState);
    return () => {
      document.removeEventListener("visibilitychange", handleCuVisibility);
      window.removeEventListener("beforeunload", saveCuState);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuPresetsState]);

  // ── Count-up background recovery ─────────────────────────────────────────────
  useEffect(() => {
    const handleCuBackground = () => {
      if (document.visibilityState !== "visible") return;
      if (!cuRunningRef.current || cuStartedAt.current == null) return;
      const now = Date.now();
      const elapsed = cuAccumulated.current + (now - cuStartedAt.current) / 1000;
      const elapsedInt = Math.floor(elapsed);
      const lastInt = cuLastElapsedTickRef.current;
      if (elapsedInt > lastInt) {
        cuLastElapsedTickRef.current = elapsedInt;
        const preset = cuPresetRef.current;
        if (preset) {
          const { goal_seconds, goal_audio } = preset;
          if (goal_seconds > 0 && elapsedInt >= goal_seconds && !cuGoalFiredRef.current) {
            cuGoalFiredRef.current = true;
            setCuGoalReached(true);
            playTone(goal_audio);
          }
        }
      }
    };
    document.addEventListener("visibilitychange", handleCuBackground);
    return () => document.removeEventListener("visibilitychange", handleCuBackground);
  }, []);

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

      // Tabata tick: only update remaining time display and trigger phase advance.
      // Countdown beeps and warning tones are pre-scheduled via scheduleAllHiitSounds.
      if (tabPhaseEndAt.current != null) {
        const remaining = Math.ceil((tabPhaseEndAt.current - now) / 1000);
        if (remaining <= 0) {
          advancePhase();
        } else {
          setTabPhaseRemaining(remaining);
        }
      }

      // Count-up tick
      if (cuStartedAt.current != null) {
        const elapsed = cuAccumulated.current + (now - cuStartedAt.current) / 1000;
        setCuElapsed(elapsed);
        const elapsedInt = Math.floor(elapsed);
        const lastInt = cuLastElapsedTickRef.current;
        if (elapsedInt > lastInt) {
          cuLastElapsedTickRef.current = elapsedInt;
          const preset = cuPresetRef.current;
          if (preset) {
            const { interval_seconds, goal_seconds, interval_audio, goal_audio } = preset;
            if (goal_seconds > 0 && elapsedInt >= goal_seconds && !cuGoalFiredRef.current) {
              cuGoalFiredRef.current = true;
              setCuGoalReached(true);
              playTone(goal_audio);
            }
            if (interval_seconds > 0 && elapsedInt > 0 && elapsedInt % interval_seconds === 0) {
              if (!(goal_seconds > 0 && elapsedInt === goal_seconds)) {
                playTone(interval_audio);
              }
            }
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
  const anyRunning = swRunning || tabRunning || cuRunning;

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

  // When returning from background, silently skip through any phases that elapsed
  // while JS was suspended, then play only the current phase's audio once.
  useEffect(() => {
    const handleReturnFromBackground = () => {
      if (document.visibilityState !== "visible") return;
      const split = tabSplitRef.current;
      if (!split || !tabRunningRef.current || tabPhaseEndAt.current == null) return;

      const now = Date.now();
      if (tabPhaseEndAt.current > now) return; // still within the current phase

      let phase = tabPhaseRef.current;
      let cycle = tabCycleRef.current;
      let endAt = tabPhaseEndAt.current;
      let completed = tabCompletedWorkCyclesRef.current;

      // Walk forward through phases using wall-clock end times until we reach a phase
      // that hasn't expired yet (or we reach "done").
      while (endAt <= now && phase !== "done") {
        if (phase === "on") completed++;
        const result = computeNextPhase(phase, cycle, split);
        phase = result.nextPhase;
        cycle = result.nextCycle;
        endAt = phase === "done" ? Infinity : endAt + result.nextDuration * 1000;
      }

      countdownFiredRef.current = new Set();
      tabCompletedWorkCyclesRef.current = completed;
      tabPhaseRef.current = phase;
      tabCycleRef.current = cycle;
      setTabCompletedWorkCycles(completed);
      setTabPhase(phase);
      setTabCurrentCycle(cycle);

      if (phase === "done") {
        tabPhaseEndAt.current = null;
        tabRunningRef.current = false;
        _hiitActive = false;
        setTabRunning(false);
        setTabPhaseRemaining(0);
        cancelHiitSchedule();
        playTone(split.done_audio);
      } else {
        tabPhaseEndAt.current = endAt;
        const remaining = Math.max(1, Math.ceil((endAt - now) / 1000));
        setTabPhaseRemaining(remaining);
        const phaseAudio =
          phase === "on"       ? split.on_audio :
          phase === "off"      ? split.off_audio :
          phase === "warmup"   ? split.warmup_audio :
          phase === "cooldown" ? split.cooldown_audio : null;
        if (phaseAudio) playTone(phaseAudio);
        // Re-schedule remaining sounds from recovered phase position
        scheduleAllHiitSounds(split, phase, cycle, endAt);
      }
    };

    document.addEventListener("visibilitychange", handleReturnFromBackground);
    return () => document.removeEventListener("visibilitychange", handleReturnFromBackground);
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

    cuRunning,
    cuElapsed,
    cuGoalReached,
    cuSelectedPreset,
    cuSelectPreset,
    cuStart,
    cuPause,
    cuResume,
    cuReset,
    cuPresets: cuPresetsState,
    cuSavePreset,
    cuDeletePreset,
    cuReorderPresets,
    cuImportPresets,
    cuExportPresets,

    anyRunning,
    tabCompletedWorkCycles,
  };
}
