"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

export interface DayTemplate {
  id: string;
  name: string;
  meal_count: number;
  item_count: number;
  total_calories: number;
  total_protein: number;
  total_fat: number;
  total_carbs: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  templates: DayTemplate[];
  onLoad: (templateId: string, mode: "replace" | "add") => Promise<void>;
  onDelete: (templateId: string) => void;
}

export default function DayTemplateSheet({ open, onClose, templates, onLoad, onDelete }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoad = async (mode: "replace" | "add") => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await onLoad(selectedId, mode);
      setSelectedId(null);
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedId(null);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          "fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background border-l border-border shadow-xl flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">Load Day Template</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto">
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10 px-4">
              No day templates yet. Save a full day from the food log.
            </p>
          )}

          {templates.map((t) => {
            const isSelected = selectedId === t.id;
            return (
              <div key={t.id} className="border-b border-border/50">
                {/* Template row */}
                <button
                  onClick={() => setSelectedId(isSelected ? null : t.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-start gap-2",
                    isSelected && "bg-muted/60"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.meal_count} meal{t.meal_count !== 1 ? "s" : ""}
                      {" · "}{t.item_count} item{t.item_count !== 1 ? "s" : ""}
                      {t.total_calories > 0 && (
                        <> · {Math.round(t.total_calories)} cal
                          {" · "}P{Math.round(t.total_protein)}g C{Math.round(t.total_carbs)}g F{Math.round(t.total_fat)}g
                        </>
                      )}
                    </div>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={cn(
                      "w-4 h-4 shrink-0 mt-0.5 text-muted-foreground transition-transform",
                      isSelected ? "rotate-180" : ""
                    )}
                  >
                    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Expanded action row */}
                {isSelected && (
                  <div className="px-4 pb-3 flex items-center gap-2">
                    <button
                      onClick={() => handleLoad("add")}
                      disabled={loading}
                      className="flex-1 rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      Add to existing
                    </button>
                    <button
                      onClick={() => handleLoad("replace")}
                      disabled={loading}
                      className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      Replace day
                    </button>
                    <button
                      onClick={() => { onDelete(t.id); setSelectedId(null); }}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete template"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={handleClose}
            className="w-full rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
