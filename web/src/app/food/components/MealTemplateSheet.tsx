"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";

export interface MealTemplate {
  id: string;
  name: string;
  item_count: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

interface TemplateItem {
  id: string;
  food_name_snapshot: string;
  serving_label_snapshot: string;
  qty: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  templates: MealTemplate[];
  /** Label for the primary action button on each template row */
  actionLabel: string;
  onAction: (template: MealTemplate) => void;
  onDelete: (templateId: string) => void;
  /** Called after item edits so parent can refresh template summaries */
  onTemplateChanged?: () => void;
  /** Optional: show "Add Blank Meal" at top */
  onAddBlank?: () => void;
}

function EditableQtyInput({
  item,
  templateId,
  onUpdated,
  onDeleted,
}: {
  item: TemplateItem;
  templateId: string;
  onUpdated: (itemId: string, newQty: number) => void;
  onDeleted: (itemId: string) => void;
}) {
  const fmt = (q: number) => (q % 1 === 0 ? String(q) : q.toFixed(2).replace(/\.?0+$/, ""));
  const [draft, setDraft] = useState(fmt(item.qty));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(fmt(item.qty));
  }, [item.qty]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = async (value: string) => {
    const num = parseFloat(value.trim());
    if (isNaN(num) || num <= 0 || num === item.qty) {
      setDraft(fmt(item.qty));
      return;
    }
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/templates/${templateId}/items/${item.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ qty: num }),
      });
      if (res.ok) {
        onUpdated(item.id, num);
        setDraft(fmt(num));
      } else {
        setDraft(fmt(item.qty));
      }
    } catch {
      setDraft(fmt(item.qty));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/templates/${templateId}/items/${item.id}`, {
        method: "DELETE",
        headers,
      });
      onDeleted(item.id);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{item.food_name_snapshot}</p>
        <p className="text-xs text-muted-foreground truncate">{item.serving_label_snapshot}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={saving}
          onFocus={(e) => { setDraft(""); e.target.select(); }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commit(draft); e.currentTarget.blur(); }
            if (e.key === "Escape") { setDraft(fmt(item.qty)); e.currentTarget.blur(); }
          }}
          className="w-14 text-xs text-center rounded border border-border/60 bg-muted/30 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background disabled:opacity-50"
        />
        <button
          onClick={handleDelete}
          disabled={saving}
          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
          title="Remove item"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function MealTemplateSheet({
  open,
  onClose,
  templates,
  actionLabel,
  onAction,
  onDelete,
  onTemplateChanged,
  onAddBlank,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<TemplateItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const openEdit = async (templateId: string) => {
    setEditingId(templateId);
    setEditItems([]);
    setLoadingItems(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/templates/${templateId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setEditItems(data.items ?? []);
      }
    } catch { /* best effort */ }
    finally { setLoadingItems(false); }
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditItems([]);
    onTemplateChanged?.();
  };

  const handleItemUpdated = (itemId: string, newQty: number) => {
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const ratio = newQty / it.qty;
        return {
          ...it,
          qty: newQty,
          calories: it.calories * ratio,
          protein: it.protein * ratio,
          fat: it.fat * ratio,
          carbs: it.carbs * ratio,
          fiber: it.fiber * ratio,
        };
      })
    );
  };

  const handleItemDeleted = (itemId: string) => {
    setEditItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  // Close edit when sheet closes
  const handleClose = () => {
    if (editingId) closeEdit();
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
          {editingId ? (
            <button
              onClick={closeEdit}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
              Back
            </button>
          ) : (
            <h2 className="text-sm font-semibold">Meal Templates</h2>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

          {/* ── Edit mode ── */}
          {editingId && (
            <>
              <p className="text-xs text-muted-foreground mb-1">
                Edit quantities or remove items. Changes save immediately.
              </p>
              {loadingItems && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              )}
              {!loadingItems && editItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 italic">No items in this template.</p>
              )}
              {!loadingItems && editItems.map((item) => (
                <EditableQtyInput
                  key={item.id}
                  item={item}
                  templateId={editingId}
                  onUpdated={handleItemUpdated}
                  onDeleted={handleItemDeleted}
                />
              ))}
            </>
          )}

          {/* ── Template list ── */}
          {!editingId && (
            <>
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
                    {/* Edit items */}
                    <button
                      onClick={() => openEdit(t.id)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                      title="Edit template items"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                      </svg>
                    </button>
                    {/* Delete */}
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
            </>
          )}
        </div>
      </div>
    </>
  );
}
