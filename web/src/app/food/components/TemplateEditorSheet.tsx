"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getAuthHeaders } from "@/lib/authHeaders";
import FoodSearchSheet from "./FoodSearchSheet";

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
  sort_order: number;
}

interface Template {
  id: string;
  name: string;
  items: TemplateItem[];
}

interface Props {
  templateId: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function TemplateEditorSheet({ templateId, onClose, onChanged }: Props) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/templates/${templateId}`, { headers });
      if (!res.ok) throw new Error("Failed to load template");
      const data = await res.json();
      setTemplate(data);
      setNameValue(data.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load template");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { fetchTemplate(); }, [fetchTemplate]);

  const saveName = async () => {
    if (!template || !nameValue.trim() || nameValue.trim() === template.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/templates/${templateId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      if (!res.ok) throw new Error("Failed to rename");
      const updated = await res.json();
      setTemplate((prev) => prev ? { ...prev, name: updated.name } : prev);
      setEditingName(false);
      onChanged();
    } catch {
      // silently revert
      setNameValue(template.name);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const deleteItem = async (iid: string) => {
    setDeletingId(iid);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/templates/${templateId}/items/${iid}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Delete failed");
      setTemplate((prev) =>
        prev ? { ...prev, items: prev.items.filter((i) => i.id !== iid) } : prev
      );
      onChanged();
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddItem = async (payload: {
    food_item_id: string;
    food_item_serving_id: string | null;
    food_name_snapshot: string;
    serving_label_snapshot: string;
    qty: number;
    calories: number;
    fat: number;
    carbs: number;
    protein: number;
    fiber: number;
  }) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/food/templates/${templateId}/items`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Failed to add item");
    }
  };

  const handleItemAdded = () => {
    fetchTemplate();
    onChanged();
  };

  const totals = template?.items.reduce(
    (acc, i) => ({
      calories: acc.calories + (i.calories ?? 0),
      protein: acc.protein + (i.protein ?? 0),
      fat: acc.fat + (i.fat ?? 0),
      carbs: acc.carbs + (i.carbs ?? 0),
      fiber: acc.fiber + (i.fiber ?? 0),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
  );

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background border-l border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") { setNameValue(template?.name ?? ""); setEditingName(false); }
                }}
                className="flex-1 min-w-0 rounded-lg border border-border bg-muted/30 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={saveName}
                disabled={savingName}
                className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingName(true); setNameValue(template?.name ?? ""); }}
              className="text-base font-semibold hover:text-primary transition-colors text-left truncate mr-2"
              title="Click to rename"
            >
              {template?.name ?? "Template"}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(rename)</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive px-4 py-6">{error}</p>
          )}

          {!loading && !error && template && (
            <>
              {/* Macro summary */}
              {totals && template.items.length > 0 && (
                <div className="px-4 py-3 border-b border-border bg-muted/20">
                  <div className="text-sm font-semibold">
                    {Math.round(totals.calories)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">kcal total</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="text-green-500">P {Math.round(totals.protein)}g</span>
                    <span className="text-amber-400">C {Math.round(totals.carbs)}g</span>
                    <span className="text-blue-400">F {Math.round(totals.fat)}g</span>
                    {totals.fiber > 0 && <span className="text-purple-400">Fb {Math.round(totals.fiber)}g</span>}
                    <span className="ml-auto">{template.items.length} item{template.items.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              )}

              {/* Items */}
              {template.items.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No items yet. Add some foods below.
                </p>
              )}

              {template.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 px-4 py-3 border-b border-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.food_name_snapshot}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.qty !== 1 ? `${item.qty} × ` : ""}{item.serving_label_snapshot}
                      {" · "}{Math.round(item.calories)} cal
                      {" · "}P{Math.round(item.protein)}g C{Math.round(item.carbs)}g F{Math.round(item.fat)}g
                    </div>
                  </div>
                  <button
                    onClick={() => deleteItem(item.id)}
                    disabled={deletingId === item.id}
                    className={cn(
                      "shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors",
                      deletingId === item.id && "opacity-40 cursor-not-allowed"
                    )}
                    title="Remove item"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0 flex gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + Add Food
          </button>
          <button
            onClick={onClose}
            className="px-4 rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* Food search sub-sheet */}
      <FoodSearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        mealId={templateId}
        onAdded={handleItemAdded}
        onAdd={handleAddItem}
        title="Add to Template"
      />
    </>
  );
}
