"use client";

import React, { useState, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DurationPicker } from "@/components/ui/mobile-pickers";
import {
  type WorkoutTimerState,
  type TabataSplit,
  type AudioSettings,
  type SoundType,
  playTone,
} from "@/hooks/useWorkoutTimer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatMS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad(m)}:${pad(s)}`;
}

function splitSummary(split: TabataSplit): string {
  const parts: string[] = [];
  if (split.warmup_seconds > 0) parts.push(`${split.warmup_seconds}s warmup`);
  parts.push(`${split.cycles}×${split.on_seconds}s/${split.off_seconds}s`);
  if (split.cooldown_seconds > 0) parts.push(`${split.cooldown_seconds}s cooldown`);
  return parts.join(" · ");
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "warmup": return "Warmup";
    case "on": return "Go!";
    case "off": return "Rest";
    case "cooldown": return "Cooldown";
    case "done": return "Done ✓";
    default: return "";
  }
}

function phaseColor(phase: string, split: TabataSplit | null): string {
  if (!split) return "#6b7280";
  switch (phase) {
    case "warmup": return split.warmup_color;
    case "on": return split.on_color;
    case "off": return split.off_color;
    case "cooldown": return split.cooldown_color;
    default: return "#6b7280";
  }
}

function newSplitId(): string {
  return `split-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const SOUND_TYPES: { value: SoundType; label: string }[] = [
  { value: "tone",        label: "Tone" },
  { value: "boxing-bell", label: "Boxing Bell" },
  { value: "air-horn",    label: "Air Horn" },
  { value: "whistle",     label: "Whistle" },
  { value: "chime",       label: "Chime" },
  { value: "buzzer",      label: "Buzzer" },
];

function emptyAudio(): AudioSettings {
  return { enabled: true, soundType: "tone", frequency: 440, oscType: "sine" };
}

// ─── AudioRow ─────────────────────────────────────────────────────────────────
// Simplified: only sound type selector + on/off + test button.

function AudioRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AudioSettings;
  onChange: (v: AudioSettings) => void;
}) {
  const soundType = value.soundType ?? "tone";
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 shrink-0 font-medium text-muted-foreground">{label}</span>
      <label className="flex items-center gap-1 cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          className="cursor-pointer"
        />
        <span className="text-xs">On</span>
      </label>
      <select
        value={soundType}
        disabled={!value.enabled}
        onChange={(e) => onChange({ ...value, soundType: e.target.value as SoundType })}
        className="flex-1 h-7 text-xs border rounded px-1 bg-background"
      >
        {SOUND_TYPES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={!value.enabled}
        onClick={() => playTone(value)}
        className="text-xs px-2 py-1 rounded border hover:bg-muted disabled:opacity-40 shrink-0"
        title="Test sound"
      >
        ▶
      </button>
    </div>
  );
}

// ─── Split Editor ─────────────────────────────────────────────────────────────

function SplitEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: TabataSplit | null;
  onSave: (s: TabataSplit) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "New Split");
  // Duration fields stored as total seconds (integers)
  const [warmup, setWarmup] = useState(initial?.warmup_seconds ?? 0);
  const [cycles, setCycles] = useState(String(initial?.cycles ?? 8));
  const [on, setOn] = useState(initial?.on_seconds ?? 20);
  const [off, setOff] = useState(initial?.off_seconds ?? 10);
  const [cooldown, setCooldown] = useState(initial?.cooldown_seconds ?? 0);
  const [warmupColor, setWarmupColor] = useState(initial?.warmup_color ?? "#3b82f6");
  const [onColor, setOnColor] = useState(initial?.on_color ?? "#22c55e");
  const [offColor, setOffColor] = useState(initial?.off_color ?? "#ef4444");
  const [cooldownColor, setCooldownColor] = useState(initial?.cooldown_color ?? "#a855f7");
  const [warmupAudio, setWarmupAudio] = useState<AudioSettings>(
    initial?.warmup_audio ?? { ...emptyAudio(), soundType: "tone" }
  );
  const [onAudio, setOnAudio] = useState<AudioSettings>(
    initial?.on_audio ?? { ...emptyAudio(), soundType: "boxing-bell" }
  );
  const [offAudio, setOffAudio] = useState<AudioSettings>(
    initial?.off_audio ?? { ...emptyAudio(), soundType: "buzzer" }
  );
  const [cooldownAudio, setCooldownAudio] = useState<AudioSettings>(
    initial?.cooldown_audio ?? { ...emptyAudio(), soundType: "tone" }
  );
  const [doneAudio, setDoneAudio] = useState<AudioSettings>(
    initial?.done_audio ?? { ...emptyAudio(), soundType: "chime" }
  );

  const handleSave = () => {
    const split: TabataSplit = {
      id: initial?.id ?? newSplitId(),
      name: name.trim() || "Split",
      warmup_seconds: Math.max(0, warmup),
      cycles: Math.max(1, parseInt(cycles) || 1),
      on_seconds: Math.max(1, on),
      off_seconds: Math.max(0, off),
      cooldown_seconds: Math.max(0, cooldown),
      warmup_color: warmupColor,
      on_color: onColor,
      off_color: offColor,
      cooldown_color: cooldownColor,
      warmup_audio: warmupAudio,
      on_audio: onAudio,
      off_audio: offAudio,
      cooldown_audio: cooldownAudio,
      done_audio: doneAudio,
    };
    onSave(split);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground text-sm">← Back</button>
        <h3 className="font-semibold text-base">{initial ? "Edit Split" : "New Split"}</h3>
      </div>

      {/* Basic fields */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="block w-full h-9 px-3 border rounded-md text-sm mt-0.5"
          />
        </div>

        {/* Duration fields use h/m/s drum pickers; Cycles stays a number input */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Warmup</label>
            <DurationPicker
              value={warmup / 60}
              onChange={(mins) => setWarmup(Math.round(mins * 60))}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Cycles</label>
            <input
              type="number"
              min={1}
              value={cycles}
              onChange={(e) => setCycles(e.target.value)}
              className="block w-full h-10 px-3 border rounded-md text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">On</label>
            <DurationPicker
              value={on / 60}
              onChange={(mins) => setOn(Math.max(1, Math.round(mins * 60)))}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Off</label>
            <DurationPicker
              value={off / 60}
              onChange={(mins) => setOff(Math.round(mins * 60))}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Cooldown</label>
            <DurationPicker
              value={cooldown / 60}
              onChange={(mins) => setCooldown(Math.round(mins * 60))}
            />
          </div>
        </div>
      </div>

      {/* Colors */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Phase Colors</p>
        <div className="flex gap-4 flex-wrap">
          {[
            { label: "Warmup", value: warmupColor, onChange: setWarmupColor },
            { label: "On", value: onColor, onChange: setOnColor },
            { label: "Off", value: offColor, onChange: setOffColor },
            { label: "Cooldown", value: cooldownColor, onChange: setCooldownColor },
          ].map(({ label, value, onChange }) => (
            <label key={label} className="flex flex-col items-center gap-1 cursor-pointer text-xs text-muted-foreground">
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0.5"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Audio */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Audio</p>
        <AudioRow label="Warmup" value={warmupAudio} onChange={setWarmupAudio} />
        <AudioRow label="On" value={onAudio} onChange={setOnAudio} />
        <AudioRow label="Off" value={offAudio} onChange={setOffAudio} />
        <AudioRow label="Cooldown" value={cooldownAudio} onChange={setCooldownAudio} />
        <AudioRow label="Done" value={doneAudio} onChange={setDoneAudio} />
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave}>Save</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Splits List View ─────────────────────────────────────────────────────────

function SplitsView({
  splits,
  onEdit,
  onDelete,
  onCopy,
  onNew,
  onBack,
  onImport,
  onExport,
  onReorder,
}: {
  splits: TabataSplit[];
  onEdit: (split: TabataSplit) => void;
  onDelete: (id: string) => void;
  onCopy: (split: TabataSplit) => void;
  onNew: () => void;
  onBack: () => void;
  onImport: (json: string) => void;
  onExport: () => void;
  onReorder: (from: number, to: number) => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") onImport(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      onReorder(dragIndex, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground text-sm">← Back</button>
          <h3 className="font-semibold text-base">Manage Splits</h3>
        </div>
        <Button size="sm" onClick={onNew}>+ New</Button>
      </div>

      <div className="space-y-2">
        {splits.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No splits saved.</p>
        )}
        {splits.map((split, index) => {
          const isDragging = dragIndex === index;
          const isOver = dragOverIndex === index && dragIndex !== index;
          return (
            <div
              key={split.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnter={() => setDragOverIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              className={`flex items-center justify-between border rounded-lg px-3 py-2 gap-2 transition-opacity ${
                isDragging ? "opacity-40" : "opacity-100"
              } ${isOver ? "border-primary border-2" : "border-border"}`}
            >
              <span className="text-muted-foreground cursor-grab select-none text-lg shrink-0" title="Drag to reorder">⠿</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{split.name}</p>
                <p className="text-xs text-muted-foreground truncate">{splitSummary(split)}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => onCopy(split)} className="text-xs px-2 py-1 rounded border hover:bg-muted" title="Duplicate">Copy</button>
                <button type="button" onClick={() => onEdit(split)} className="text-xs px-2 py-1 rounded border hover:bg-muted">Edit</button>
                <button
                  type="button"
                  onClick={() => { if (confirm(`Delete "${split.name}"?`)) onDelete(split.id); }}
                  className="text-xs px-2 py-1 rounded border hover:bg-muted text-destructive"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={onExport}>Export JSON</Button>
        <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>Import JSON</Button>
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileImport} />
      </div>
    </div>
  );
}

// ─── Stopwatch Tab ─────────────────────────────────────────────────────────────

function StopwatchTab({
  timer,
  onSendToWorkout,
}: {
  timer: WorkoutTimerState;
  onSendToWorkout?: (seconds: number) => void;
}) {
  const toggleSw = timer.swRunning ? timer.swPause : timer.swStart;
  const swHint = timer.swRunning
    ? "Tap to pause"
    : timer.swDisplay > 0
    ? "Tap to resume"
    : "Tap to start";

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Tappable time display */}
      <div
        role="button"
        tabIndex={0}
        aria-label={swHint}
        onClick={toggleSw}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") toggleSw(); }}
        className="font-mono text-5xl font-bold tabular-nums tracking-tight cursor-pointer select-none active:opacity-70"
      >
        {formatHMS(timer.swDisplay)}
      </div>
      <p className="text-xs text-muted-foreground -mt-4">{swHint}</p>
      <div className="flex gap-3">
        {!timer.swRunning ? (
          <Button onClick={timer.swStart} className="w-28">
            {timer.swDisplay > 0 ? "Resume" : "Start"}
          </Button>
        ) : (
          <Button onClick={timer.swPause} variant="outline" className="w-28">Pause</Button>
        )}
        <Button onClick={timer.swReset} variant="ghost">Reset</Button>
      </div>
      {onSendToWorkout && timer.swDisplay > 0 && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => onSendToWorkout(timer.swDisplay)}
        >
          Send to Workout Duration
        </Button>
      )}
      <p className="text-xs text-muted-foreground text-center max-w-xs">
        Keeps running when the panel is closed.
      </p>
    </div>
  );
}

// ─── Tabata Tab ────────────────────────────────────────────────────────────────

function TabataTab({
  timer,
  onManageSplits,
  onSendToWorkout,
}: {
  timer: WorkoutTimerState;
  onManageSplits: () => void;
  onSendToWorkout?: (seconds: number) => void;
}) {
  // Local state: split selected but timer not yet started
  const [pendingSplit, setPendingSplit] = useState<TabataSplit | null>(null);

  const { tabPhase, tabRunning, tabSelectedSplit, tabPhaseRemaining, tabCurrentCycle } = timer;
  const isActive = tabPhase !== "idle" && tabPhase !== "done";
  const isDone = tabPhase === "done";
  const color = phaseColor(tabPhase, tabSelectedSplit);

  const handleSelectSplit = (split: TabataSplit) => {
    timer.tabSelectSplit(split);
    setPendingSplit(split);
  };

  const handleStart = () => {
    setPendingSplit(null);
    timer.tabStart();
  };

  const handleChooseDifferent = () => {
    setPendingSplit(null);
    timer.tabReset();
  };

  // Reset HIIT timer but stay on the ready screen for the same split
  const handleReset = () => {
    setPendingSplit(tabSelectedSplit);
    timer.tabReset();
  };

  // Stopwatch controls for the active HIIT screen
  const swToggle = timer.swRunning ? timer.swPause : timer.swStart;
  const swHint = timer.swRunning
    ? "Tap to pause stopwatch"
    : timer.swDisplay > 0
    ? "Tap to resume stopwatch"
    : "Tap to start stopwatch";

  // ── Idle — split selector ────────────────────────────────────────────────────
  if (tabPhase === "idle" && !tabRunning && !pendingSplit) {
    return (
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          {timer.splits.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No splits. Create one via Manage Splits.
            </p>
          )}
          {timer.splits.map((split) => (
            <button
              key={split.id}
              type="button"
              onClick={() => handleSelectSplit(split)}
              className="w-full text-left border rounded-lg px-3 py-2.5 transition-colors border-border hover:bg-muted active:bg-muted"
            >
              <p className="text-sm font-medium">{split.name}</p>
              <p className="text-xs text-muted-foreground">{splitSummary(split)}</p>
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onManageSplits}
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Manage Splits →
          </button>
        </div>
      </div>
    );
  }

  // ── Ready — split selected, not yet started ──────────────────────────────────
  if (tabPhase === "idle" && pendingSplit) {
    const firstPhase = pendingSplit.warmup_seconds > 0 ? "warmup" : "on";
    const firstDuration = pendingSplit.warmup_seconds > 0 ? pendingSplit.warmup_seconds : pendingSplit.on_seconds;
    const readyColor = firstPhase === "warmup" ? pendingSplit.warmup_color : pendingSplit.on_color;
    const readyLabel = firstPhase === "warmup" ? "Warmup" : "Go!";

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-center text-muted-foreground font-medium">{pendingSplit.name}</p>
        {/* Tap to start */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Tap to start"
          onClick={handleStart}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") handleStart(); }}
          className="rounded-xl flex flex-col items-center justify-center py-8 gap-2 cursor-pointer select-none"
          style={{ backgroundColor: readyColor + "22", borderColor: readyColor + "66", borderWidth: 2 }}
        >
          <div className="text-5xl font-mono font-bold tabular-nums tracking-tight" style={{ color: readyColor }}>
            {formatMS(firstDuration)}
          </div>
          <div className="text-xl font-semibold" style={{ color: readyColor }}>{readyLabel}</div>
          <div className="text-xs mt-1" style={{ color: readyColor + "99" }}>Tap to start</div>
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={handleStart} className="w-28">Start</Button>
          <Button variant="ghost" onClick={() => setPendingSplit(null)}>← Back</Button>
        </div>

        {/* Stopwatch — visible on ready screen too */}
        <div
          role="button"
          tabIndex={0}
          aria-label={swHint}
          onClick={swToggle}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") swToggle(); }}
          className="rounded-xl flex flex-col items-center justify-center py-4 gap-1 cursor-pointer select-none"
          style={{ backgroundColor: "#6b728018", borderColor: "#6b728044", borderWidth: 2 }}
        >
          <div className="font-mono text-5xl font-bold tabular-nums tracking-tight text-muted-foreground">
            {formatHMS(timer.swDisplay)}
          </div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest">
            {swHint}
          </div>
        </div>
        {timer.swDisplay > 0 && (
          <div className="flex justify-center gap-2">
            <Button variant="ghost" size="sm" onClick={timer.swReset} className="text-xs text-muted-foreground">
              Reset Stopwatch
            </Button>
            {onSendToWorkout && (
              <Button variant="secondary" size="sm" className="text-xs" onClick={() => onSendToWorkout(timer.swDisplay)}>
                Send to Workout Duration
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (isDone) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 w-full">
        <div className="text-4xl font-bold">Done ✓</div>
        <p className="text-sm text-muted-foreground">{tabSelectedSplit?.name}</p>
        {/* Tappable stopwatch — same as active screen */}
        <div
          role="button"
          tabIndex={0}
          aria-label={swHint}
          onClick={swToggle}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") swToggle(); }}
          className="rounded-xl flex flex-col items-center justify-center py-4 gap-1 cursor-pointer select-none w-full"
          style={{ backgroundColor: "#6b728018", borderColor: "#6b728044", borderWidth: 2 }}
        >
          <div className="font-mono text-5xl font-bold tabular-nums tracking-tight text-muted-foreground">
            {formatHMS(timer.swDisplay)}
          </div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest">
            {swHint}
          </div>
        </div>
        {timer.swDisplay > 0 && (
          <div className="flex justify-center gap-2">
            <Button variant="ghost" size="sm" onClick={timer.swReset} className="text-xs text-muted-foreground">
              Reset Stopwatch
            </Button>
            {onSendToWorkout && (
              <Button variant="secondary" size="sm" className="text-xs" onClick={() => onSendToWorkout(timer.swDisplay)}>
                Send to Workout Duration
              </Button>
            )}
          </div>
        )}
        <div className="flex gap-3">
          <Button onClick={timer.tabReset}>Repeat</Button>
          <Button variant="outline" onClick={handleChooseDifferent}>Choose Different</Button>
        </div>
      </div>
    );
  }

  // ── Active / Paused ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* Phase block — tap to pause/resume */}
      <div
        role="button"
        tabIndex={0}
        aria-label={tabRunning ? "Tap to pause" : "Tap to resume"}
        onClick={tabRunning ? timer.tabPause : timer.tabResume}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            tabRunning ? timer.tabPause() : timer.tabResume();
          }
        }}
        className="rounded-xl flex flex-col items-center justify-center py-8 gap-2 transition-colors duration-300 cursor-pointer select-none"
        style={{ backgroundColor: color + "22", borderColor: color + "66", borderWidth: 2 }}
      >
        <div className="text-5xl font-mono font-bold tabular-nums tracking-tight" style={{ color }}>
          {formatMS(tabPhaseRemaining)}
        </div>
        <div className="text-xl font-semibold" style={{ color }}>
          {phaseLabel(tabPhase)}
        </div>
        {isActive && tabSelectedSplit && tabPhase !== "warmup" && tabPhase !== "cooldown" && (
          <div className="text-sm text-muted-foreground">
            Cycle {tabCurrentCycle} / {tabSelectedSplit.cycles}
          </div>
        )}
        <div className="text-xs mt-1" style={{ color: color + "99" }}>
          {tabRunning ? "Tap to pause" : "Tap to resume"}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex gap-2 justify-center items-center">
        <button
          type="button"
          onClick={timer.tabPrevPhase}
          className="w-10 h-10 rounded-full border flex items-center justify-center text-lg hover:bg-muted"
          title="Previous section"
        >
          ⏮
        </button>
        {tabRunning ? (
          <Button onClick={timer.tabPause} variant="outline" className="w-28">Pause</Button>
        ) : (
          <Button onClick={timer.tabResume} className="w-28">Resume</Button>
        )}
        <button
          type="button"
          onClick={timer.tabNextPhase}
          className="w-10 h-10 rounded-full border flex items-center justify-center text-lg hover:bg-muted"
          title="Next section"
        >
          ⏭
        </button>
        <Button onClick={handleReset} variant="ghost" size="sm">Reset</Button>
      </div>

      {/* Stopwatch — tappable to start/pause/resume, with reset button */}
      <div
        role="button"
        tabIndex={0}
        aria-label={swHint}
        onClick={swToggle}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") swToggle(); }}
        className="rounded-xl flex flex-col items-center justify-center py-4 gap-1 cursor-pointer select-none"
        style={{ backgroundColor: "#6b728018", borderColor: "#6b728044", borderWidth: 2 }}
      >
        <div className="font-mono text-5xl font-bold tabular-nums tracking-tight text-muted-foreground">
          {formatHMS(timer.swDisplay)}
        </div>
        <div className="text-xs text-muted-foreground uppercase tracking-widest">
          {swHint}
        </div>
      </div>
      {timer.swDisplay > 0 && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={timer.swReset}
            className="text-xs text-muted-foreground"
          >
            Reset Stopwatch
          </Button>
          {onSendToWorkout && (
            <Button variant="secondary" size="sm" className="text-xs" onClick={() => onSendToWorkout(timer.swDisplay)}>
              Send to Workout Duration
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────

export function WorkoutTimerFAB({
  timer,
  onClick,
}: {
  timer: WorkoutTimerState;
  onClick: () => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-1">
      {timer.swRunning && (
        <div className="text-xs font-mono bg-background border rounded px-2 py-0.5 shadow tabular-nums">
          {formatHMS(timer.swDisplay)}
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        className="relative w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center text-2xl hover:bg-primary/90 transition-colors"
        title="Workout Timer"
      >
        ⏱
        {timer.anyRunning && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-background" />
        )}
      </button>
    </div>
  );
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

type InternalView = "main" | "splits" | "editor";

export function WorkoutTimerSheet({
  timer,
  open,
  onOpenChange,
  onSendToWorkout,
}: {
  timer: WorkoutTimerState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendToWorkout?: (seconds: number) => void;
}) {
  const [view, setView] = useState<InternalView>("main");
  const [editingSplit, setEditingSplit] = useState<TabataSplit | null>(null);
  const [activeTab, setActiveTab] = useState("stopwatch");

  const handleExport = () => {
    const json = timer.exportSplits();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workout-splits.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSplit = (split: TabataSplit) => {
    timer.saveSplit(split);
    setView("splits");
    setEditingSplit(null);
  };

  const handleCopySplit = (split: TabataSplit) => {
    const copy: TabataSplit = {
      ...split,
      id: newSplitId(),
      name: `${split.name} (copy)`,
    };
    timer.saveSplit(copy);
  };

  const goBackToTabata = () => {
    setView("main");
    setActiveTab("tabata");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetTitle className="sr-only">Workout Timer</SheetTitle>

        {view === "editor" && (
          <SplitEditor
            initial={editingSplit}
            onSave={handleSaveSplit}
            onCancel={() => { setView("splits"); setEditingSplit(null); }}
          />
        )}

        {view === "splits" && (
          <SplitsView
            splits={timer.splits}
            onEdit={(split) => { setEditingSplit(split); setView("editor"); }}
            onDelete={timer.deleteSplit}
            onCopy={handleCopySplit}
            onNew={() => { setEditingSplit(null); setView("editor"); }}
            onBack={goBackToTabata}
            onImport={timer.importSplits}
            onExport={handleExport}
            onReorder={timer.reorderSplits}
          />
        )}

        {view === "main" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Workout Timer</h2>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="stopwatch" className="flex-1">Stopwatch</TabsTrigger>
                <TabsTrigger value="tabata" className="flex-1">Tabata / HIIT</TabsTrigger>
              </TabsList>
              <TabsContent value="stopwatch">
                <StopwatchTab timer={timer} onSendToWorkout={onSendToWorkout} />
              </TabsContent>
              <TabsContent value="tabata">
                <TabataTab
                  timer={timer}
                  onManageSplits={() => setView("splits")}
                  onSendToWorkout={onSendToWorkout}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
