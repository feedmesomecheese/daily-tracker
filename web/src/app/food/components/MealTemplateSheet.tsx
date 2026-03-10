"use client";

import { cn } from "@/lib/utils";

export interface MealTemplate {
  id: string;
  name: string;
  item_count: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  templates: MealTemplate[];
  /** Label for the primary action button on each template row */
  actionLabel: string;
  onAction: (template: MealTemplate) => void;
  onDelete: (templateId: string) => void;
  /** Optional: show "Add Blank Meal" at top */
  onAddBlank?: () => void;
}

export default function MealTemplateSheet({
  open,
  onClose,
  templates,
  actionLabel,
  onAction,
  onDelete,
  onAddBlank,
}: Props) {
  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sheet — slides up from bottom */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border rounded-t-2xl shadow-xl transition-transform duration-300 max-h-[70vh] flex flex-col",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">Meal Templates</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {/* Blank meal option */}
          {onAddBlank && (
            <button
              onClick={() => { onAddBlank(); onClose(); }}
              className="w-full text-left rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Add Blank Meal
            </button>
          )}

          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No templates saved yet.
              <br />
              <span className="text-xs">Use the ⋯ menu on a meal card to save one.</span>
            </p>
          )}

          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.item_count} {t.item_count === 1 ? "item" : "items"} &middot;{" "}
                  {Math.round(t.total_calories)} cal &middot;{" "}
                  <span className="text-green-500">P{Math.round(t.total_protein)}g</span>{" "}
                  <span className="text-amber-400">C{Math.round(t.total_carbs)}g</span>{" "}
                  <span className="text-blue-400">F{Math.round(t.total_fat)}g</span>
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => { onAction(t); onClose(); }}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  {actionLabel}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete template "${t.name}"?`)) onDelete(t.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete template"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
