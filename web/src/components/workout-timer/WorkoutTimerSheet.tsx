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
import {
  type WorkoutTimerState,
  type TabataSplit,
  type AudioSettings,
  type OscType,
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

const DEFAULT_AUDIO: AudioSettings = { enabled: false, frequency: 440, oscType: "sine" };

function emptyAudio(): AudioSettings {
  return { enabled: true, frequency: 440, oscType: "sine" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AudioRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AudioSettings;
  onChange: (v: AudioSettings) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <label className="w-20 shrink-0 font-medium text-muted-foreground">{label}</label>
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          className="cursor-pointer"
        />
        <span className="text-xs">On</span>
      </label>
      <div className="flex items-center gap-1 flex-1 min-w-[140px]">
        <span className="text-xs text-muted-foreground w-8">{value.frequency}Hz</span>
        <input
          type="range"
          min={100}
          max={2000}
          step={10}
          value={value.frequency}
          disabled={!value.enabled}
          onChange={(e) => onChange({ ...value, frequency: Number(e.target.value) })}
          className="flex-1 h-1.5 accent-primary"
        />
      </div>
      <select
        value={value.oscType}
        disabled={!value.enabled}
        onChange={(e) => onChange({ ...value, oscType: e.target.value as OscType })}
        className="h-7 text-xs border rounded px-1 bg-background"
      >
        <option value="sine">Sine</option>
        <option value="square">Square</option>
        <option value="sawtooth">Sawtooth</option>
        <option value="triangle">Triangle</option>
      </select>
      <button
        type="button"
        disabled={!value.enabled}
        onClick={() => playTone(value)}
        className="text-xs px-2 py-1 rounded border hover:bg-muted disabled:opacity-40"
        title="Test tone"
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
  const [warmup, setWarmup] = useState(String(initial?.warmup_seconds ?? 0));
  const [cycles, setCycles] = useState(String(initial?.cycles ?? 8));
  const [on, setOn] = useState(String(initial?.on_seconds ?? 20));
  const [off, setOff] = useState(String(initial?.off_seconds ?? 10));
  const [cooldown, setCooldown] = useState(String(initial?.cooldown_seconds ?? 0));
  const [warmupColor, setWarmupColor] = useState(initial?.warmup_color ?? "#3b82f6");
  const [onColor, setOnColor] = useState(initial?.on_color ?? "#22c55e");
  const [offColor, setOffColor] = useState(initial?.off_color ?? "#ef4444");
  const [cooldownColor, setCooldownColor] = useState(initial?.cooldown_color ?? "#a855f7");
  const [warmupAudio, setWarmupAudio] = useState<AudioSettings>(initial?.warmup_audio ?? { ...emptyAudio(), frequency: 440 });
  const [onAudio, setOnAudio] = useState<AudioSettings>(initial?.on_audio ?? { ...emptyAudio(), frequency: 880 });
  const [offAudio, setOffAudio] = useState<AudioSettings>(initial?.off_audio ?? { ...emptyAudio(), frequency: 330 });
  const [cooldownAudio, setCooldownAudio] = useState<AudioSettings>(initial?.cooldown_audio ?? { ...emptyAudio(), frequency: 440 });
  const [doneAudio, setDoneAudio] = useState<AudioSettings>(initial?.done_audio ?? { ...emptyAudio(), frequency: 660 });

  const handleSave = () => {
    const split: TabataSplit = {
      id: initial?.id ?? newSplitId(),
      name: name.trim() || "Split",
      warmup_seconds: Math.max(0, parseInt(warmup) || 0),
      cycles: Math.max(1, parseInt(cycles) || 1),
      on_seconds: Math.max(1, parseInt(on) || 1),
      off_seconds: Math.max(0, parseInt(off) || 0),
      cooldown_seconds: Math.max(0, parseInt(cooldown) || 0),
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
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Warmup (s)</label>
            <input
              type="number"
              min={0}
              value={warmup}
              onChange={(e) => setWarmup(e.target.value)}
              className="block w-full h-9 px-3 border rounded-md text-sm mt-0.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cycles</label>
            <input
              type="number"
              min={1}
              value={cycles}
              onChange={(e) => setCycles(e.target.value)}
              className="block w-full h-9 px-3 border rounded-md text-sm mt-0.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cooldown (s)</label>
            <input
              type="number"
              min={0}
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              className="block w-full h-9 px-3 border rounded-md text-sm mt-0.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">On (s)</label>
            <input
              type="number"
              min={1}
              value={on}
              onChange={(e) => setOn(e.target.value)}
              className="block w-full h-9 px-3 border rounded-md text-sm mt-0.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Off (s)</label>
            <input
              type="number"
              min={0}
              value={off}
              onChange={(e) => setOff(e.target.value)}
              className="block w-full h-9 px-3 border rounded-md text-sm mt-0.5"
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
        <p className="text-xs text-muted-foreground">Audio Tones</p>
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
  onNew,
  onBack,
  onImport,
  onExport,
}: {
  splits: TabataSplit[];
  onEdit: (split: TabataSplit) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onBack: () => void;
  onImport: (json: string) => void;
  onExport: () => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);

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
        {splits.map((split) => (
          <div key={split.id} className="flex items-center justify-between border rounded-lg px-3 py-2 gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{split.name}</p>
              <p className="text-xs text-muted-foreground truncate">{splitSummary(split)}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onEdit(split)}
                className="text-xs px-2 py-1 rounded border hover:bg-muted"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${split.name}"?`)) onDelete(split.id);
                }}
                className="text-xs px-2 py-1 rounded border hover:bg-muted text-destructive"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={onExport}>Export JSON</Button>
        <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>Import JSON</Button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileImport}
        />
      </div>
    </div>
  );
}

// ─── Stopwatch Tab ─────────────────────────────────────────────────────────────

function StopwatchTab({ timer }: { timer: WorkoutTimerState }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="font-mono text-5xl font-bold tabular-nums tracking-tight">
        {formatHMS(timer.swDisplay)}
      </div>
      <div className="flex gap-3">
        {!timer.swRunning ? (
          <Button onClick={timer.swStart} className="w-28">Start</Button>
        ) : (
          <Button onClick={timer.swPause} variant="outline" className="w-28">Pause</Button>
        )}
        <Button onClick={timer.swReset} variant="ghost">Reset</Button>
      </div>
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
}: {
  timer: WorkoutTimerState;
  onManageSplits: () => void;
}) {
  const { tabPhase, tabRunning, tabSelectedSplit, tabPhaseRemaining, tabCurrentCycle } = timer;
  const isActive = tabPhase !== "idle" && tabPhase !== "done";
  const isDone = tabPhase === "done";
  const color = phaseColor(tabPhase, tabSelectedSplit);

  // Idle — split selector
  if (tabPhase === "idle" && !tabRunning) {
    return (
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          {timer.splits.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No splits. Create one via Manage Splits.
            </p>
          )}
          {timer.splits.map((split) => {
            const isSelected = timer.tabSelectedSplit?.id === split.id;
            return (
              <button
                key={split.id}
                type="button"
                onClick={() => timer.tabSelectSplit(split)}
                className={`w-full text-left border rounded-lg px-3 py-2.5 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted"
                }`}
              >
                <p className="text-sm font-medium">{split.name}</p>
                <p className="text-xs text-muted-foreground">{splitSummary(split)}</p>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onManageSplits}
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Manage Splits →
          </button>
          <Button
            disabled={!timer.tabSelectedSplit}
            onClick={timer.tabStart}
          >
            Start
          </Button>
        </div>
      </div>
    );
  }

  // Done
  if (isDone) {
    return (
      <div className="flex flex-col items-center gap-6 py-6">
        <div className="text-4xl font-bold">Done ✓</div>
        <p className="text-sm text-muted-foreground">{tabSelectedSplit?.name}</p>
        <div className="flex gap-3">
          <Button onClick={timer.tabStart}>Repeat</Button>
          <Button variant="outline" onClick={timer.tabReset}>Choose Different</Button>
        </div>
      </div>
    );
  }

  // Active / Paused
  return (
    <div className="flex flex-col gap-4">
      {/* Phase block */}
      <div
        className="rounded-xl flex flex-col items-center justify-center py-8 gap-2 transition-colors duration-300"
        style={{ backgroundColor: color + "22", borderColor: color + "66", borderWidth: 2 }}
      >
        <div
          className="text-5xl font-mono font-bold tabular-nums tracking-tight"
          style={{ color }}
        >
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
      </div>

      <div className="flex gap-3 justify-center">
        {tabRunning ? (
          <Button onClick={timer.tabPause} variant="outline" className="w-28">Pause</Button>
        ) : (
          <Button onClick={timer.tabResume} className="w-28">Resume</Button>
        )}
        <Button onClick={timer.tabReset} variant="ghost">Reset</Button>
      </div>
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
}: {
  timer: WorkoutTimerState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [view, setView] = useState<InternalView>("main");
  const [editingSplit, setEditingSplit] = useState<TabataSplit | null>(null);

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
            onNew={() => { setEditingSplit(null); setView("editor"); }}
            onBack={() => setView("main")}
            onImport={timer.importSplits}
            onExport={handleExport}
          />
        )}

        {view === "main" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Workout Timer</h2>
            <Tabs defaultValue="stopwatch">
              <TabsList className="w-full">
                <TabsTrigger value="stopwatch" className="flex-1">Stopwatch</TabsTrigger>
                <TabsTrigger value="tabata" className="flex-1">Tabata / HIIT</TabsTrigger>
              </TabsList>
              <TabsContent value="stopwatch">
                <StopwatchTab timer={timer} />
              </TabsContent>
              <TabsContent value="tabata">
                <TabataTab
                  timer={timer}
                  onManageSplits={() => setView("splits")}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
