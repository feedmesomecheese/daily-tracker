"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getAuthHeaders } from "@/lib/authHeaders";
export type WorkoutTemplate = {
  id: string;
  name: string;
  workout_type_id: string | null;
  exercises: {
    id: string;
    exercise_id: string | null;
    exercise_name_display: string;
    modifier_ids: string[];
    exercise_order: number;
    target_sets: number | null;
    target_reps: number | null;
    target_weight: number | null;
  }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (template: WorkoutTemplate) => void;
};

export default function TemplateSheet({ open, onOpenChange, onLoad }: Props) {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTemplates() {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/templates", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load templates");
      setTemplates(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading templates");
    } finally {
      setLoading(false);
    }
  }

  function handleLoad(template: WorkoutTemplate) {
    onLoad(template);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col" storageKey="workout_template_sheet_width" defaultWidth={448}>
        <SheetHeader>
          <SheetTitle>Load Template</SheetTitle>
          <SheetDescription>
            Select a template to populate your exercise list.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 flex-1 mt-4 overflow-y-auto pr-1">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!loading && templates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No templates yet. Save a workout as a template from the workout form or history cards.
            </p>
          )}

          {templates.map((t) => (
            <div key={t.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                <span className="text-sm font-medium flex-1">{t.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {t.exercises.length} exercise{t.exercises.length !== 1 ? "s" : ""}
                </span>
              </div>

              {t.exercises.length > 0 && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground space-y-0.5 border-t">
                  {t.exercises.map((ex) => (
                    <div key={ex.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{ex.exercise_name_display}</span>
                      {ex.target_sets != null && (
                        <span className="shrink-0 tabular-nums text-muted-foreground/70">
                          {ex.target_sets}×{ex.target_reps ?? "?"}
                          {ex.target_weight ? ` @ ${ex.target_weight}` : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="px-2 py-1.5 border-t bg-background">
                <Button size="sm" className="w-full h-7 text-xs" onClick={() => handleLoad(t)}>
                  Load
                </Button>
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground text-center mt-2">
            Manage templates in{" "}
            <a href="/workouts/exercises?tab=templates" className="underline hover:text-foreground">
              Exercises → Templates
            </a>
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

