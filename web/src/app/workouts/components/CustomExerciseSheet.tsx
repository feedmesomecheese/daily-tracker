"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAuthHeaders } from "@/lib/authHeaders";

type ExerciseGroup = {
  id: string;
  name: string;
};

type Modifier = {
  id: string;
  name: string;
};

type CustomExerciseSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ExerciseGroup[];
  modifiers: Modifier[];
  onCreated: (exercise: {
    id: string;
    name: string;
    exercise_type: string;
    group_ids: string[];
    available_modifier_ids: string[];
  }) => void;
};

export default function CustomExerciseSheet({
  open,
  onOpenChange,
  groups,
  modifiers,
  onCreated,
}: CustomExerciseSheetProps) {
  const [name, setName] = useState("");
  const [exerciseType, setExerciseType] = useState("weighted");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [countsTowardVolume, setCountsTowardVolume] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setExerciseType("weighted");
    setSelectedGroups([]);
    setSelectedModifiers([]);
    setCountsTowardVolume(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/exercises", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          exercise_type: exerciseType,
          group_ids: selectedGroups,
          available_modifier_ids: selectedModifiers,
          counts_toward_volume: countsTowardVolume,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to create exercise");
      }

      const exercise = await res.json();
      onCreated(exercise);
      resetForm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create exercise");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-auto">
        <SheetHeader>
          <SheetTitle>Create Exercise</SheetTitle>
          <SheetDescription>
            Add a new exercise to your library and the current workout.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              placeholder="Exercise name..."
              className="w-full h-9 px-3 border rounded-md text-sm mt-1"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium">Type</label>
            <Select value={exerciseType} onValueChange={setExerciseType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weighted">Weighted</SelectItem>
                <SelectItem value="bodyweight">Bodyweight</SelectItem>
                <SelectItem value="cardio_hiit">HIIT</SelectItem>
                <SelectItem value="cardio_zone2">Zone 2</SelectItem>
                <SelectItem value="sport">Sport</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Groups</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedGroups([...selectedGroups, g.id]);
                      } else {
                        setSelectedGroups(selectedGroups.filter((id) => id !== g.id));
                      }
                    }}
                  />
                  {g.name}
                </label>
              ))}
              {groups.length === 0 && (
                <span className="text-xs text-muted-foreground">No groups available</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Modifiers</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {modifiers.map((m) => (
                <label key={m.id} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedModifiers.includes(m.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedModifiers([...selectedModifiers, m.id]);
                      } else {
                        setSelectedModifiers(selectedModifiers.filter((id) => id !== m.id));
                      }
                    }}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={countsTowardVolume}
                onChange={(e) => setCountsTowardVolume(e.target.checked)}
              />
              Counts toward volume
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Creating..." : "Create & Add"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
