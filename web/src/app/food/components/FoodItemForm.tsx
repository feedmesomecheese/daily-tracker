"use client";

import { useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import type { FoodItem } from "./FoodLibraryRow";

interface ServingRow {
  id?: string;
  label: string;
  calories: string;
  fat: string;
  carbs: string;
  protein: string;
  fiber: string;
  is_default: boolean;
  sort_order: number;
  is_global: boolean;  // true = seeded/read-only, false = user-owned or new
  _deleted?: boolean;
}

interface Props {
  item?: FoodItem; // if provided → editing mode
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORY_OPTIONS = ["Meat", "Dairy", "Grains", "Plants", "Misc"] as const;

function emptyServing(sort_order: number): ServingRow {
  return {
    label: "",
    calories: "",
    fat: "",
    carbs: "",
    protein: "",
    fiber: "",
    is_default: false,
    sort_order,
    is_global: false,
  };
}

function itemToServingRows(item: FoodItem): ServingRow[] {
  return item.servings.map((s, i) => ({
    id: s.id,
    label: s.label,
    calories: String(s.calories),
    fat: String(s.fat),
    carbs: String(s.carbs),
    protein: String(s.protein),
    fiber: String(s.fiber),
    is_default: s.is_default,
    sort_order: i,
    is_global: !s.owner_id, // no owner_id = global seed serving
  }));
}

export function FoodItemForm({ item, onClose, onSaved }: Props) {
  const isEditing = !!item;
  const isGlobal = isEditing && !item.is_custom; // global food: name/category are read-only
  const overlayRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<string>(item?.category ?? "Misc");
  const [subCategory, setSubCategory] = useState(item?.sub_category ?? "");
  const [note, setNote] = useState("");
  const [servings, setServings] = useState<ServingRow[]>(
    item ? itemToServingRows(item) : [{ ...emptyServing(0), is_default: true }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  // ── Serving helpers ──────────────────────────────────────────────

  const updateServing = (index: number, field: keyof ServingRow, value: string | boolean) => {
    setServings((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const setDefault = (index: number) => {
    setServings((prev) => prev.map((s, i) => ({ ...s, is_default: i === index })));
  };

  const addServing = () => {
    setServings((prev) => [...prev, emptyServing(prev.filter((s) => !s._deleted).length)]);
  };

  const removeServing = (index: number) => {
    setServings((prev) => {
      const s = prev[index];
      if (s.id) {
        const updated = prev.map((row, i) => (i === index ? { ...row, _deleted: true } : row));
        const hasDefault = updated.some((r) => r.is_default && !r._deleted);
        if (!hasDefault) {
          const firstActive = updated.findIndex((r) => !r._deleted);
          if (firstActive >= 0) updated[firstActive] = { ...updated[firstActive], is_default: true };
        }
        return updated;
      } else {
        const filtered = prev.filter((_, i) => i !== index);
        if (!filtered.some((r) => r.is_default) && filtered.length > 0)
          filtered[0] = { ...filtered[0], is_default: true };
        return filtered;
      }
    });
  };

  // ── Validation ───────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!isGlobal && !name.trim()) return "Name is required.";
    const activeServings = servings.filter((s) => !s._deleted);
    const userServings = activeServings.filter((s) => !s.is_global);
    // For new food creation, all servings must be valid; for editing, only new user servings
    const toValidate = isGlobal ? userServings : activeServings;
    if (!isGlobal && activeServings.length === 0) return "At least one serving is required.";
    for (const s of toValidate) {
      if (!s.label.trim()) return "All servings need a label.";
      if (isNaN(Number(s.calories)) || Number(s.calories) < 0)
        return "Calories must be a non-negative number.";
    }
    return null;
  };

  // ── Save ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError(null);
    setSaving(true);

    try {
      const headers = await getAuthHeaders();
      const jsonHeaders = { ...headers, "Content-Type": "application/json" };

      if (!isEditing) {
        // CREATE new custom food
        const activeServings = servings.filter((s) => !s._deleted);
        const body = {
          name: name.trim(),
          category,
          sub_category: subCategory.trim() || null,
          note: note.trim() || null,
          servings: activeServings.map((s, i) => ({
            label: s.label.trim(),
            calories: Number(s.calories) || 0,
            fat: Number(s.fat) || 0,
            carbs: Number(s.carbs) || 0,
            protein: Number(s.protein) || 0,
            fiber: Number(s.fiber) || 0,
            is_default: s.is_default,
            sort_order: i,
          })),
        };
        const res = await fetch("/api/food/items", { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to create food item");

      } else if (isGlobal) {
        // GLOBAL food — only manage user-owned servings (add new ones, delete user's own)
        for (const s of servings) {
          if (s._deleted && s.id && !s.is_global) {
            await fetch(`/api/food/items/${item!.id}/servings/${s.id}`, { method: "DELETE", headers });
          } else if (!s._deleted && !s.id) {
            await fetch(`/api/food/items/${item!.id}/servings`, {
              method: "POST",
              headers: jsonHeaders,
              body: JSON.stringify({
                label: s.label.trim(),
                calories: Number(s.calories) || 0,
                fat: Number(s.fat) || 0,
                carbs: Number(s.carbs) || 0,
                protein: Number(s.protein) || 0,
                fiber: Number(s.fiber) || 0,
                is_default: s.is_default,
                sort_order: s.sort_order,
              }),
            });
          } else if (!s._deleted && s.id && !s.is_global) {
            // Edit user's own existing serving on a global food
            await fetch(`/api/food/items/${item!.id}/servings/${s.id}`, {
              method: "PATCH",
              headers: jsonHeaders,
              body: JSON.stringify({
                label: s.label.trim(),
                calories: Number(s.calories) || 0,
                fat: Number(s.fat) || 0,
                carbs: Number(s.carbs) || 0,
                protein: Number(s.protein) || 0,
                fiber: Number(s.fiber) || 0,
                is_default: s.is_default,
                sort_order: s.sort_order,
              }),
            });
          }
        }

      } else {
        // CUSTOM food — full edit
        const patchRes = await fetch(`/api/food/items/${item!.id}`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({
            name: name.trim(),
            category,
            sub_category: subCategory.trim() || null,
            note: note.trim() || null,
          }),
        });
        const patchJson = await patchRes.json();
        if (!patchRes.ok) throw new Error(patchJson?.error || "Failed to update food item");

        for (const s of servings) {
          if (s._deleted && s.id) {
            await fetch(`/api/food/items/${item!.id}/servings/${s.id}`, { method: "DELETE", headers });
          } else if (!s._deleted && !s.id) {
            await fetch(`/api/food/items/${item!.id}/servings`, {
              method: "POST",
              headers: jsonHeaders,
              body: JSON.stringify({
                label: s.label.trim(),
                calories: Number(s.calories) || 0,
                fat: Number(s.fat) || 0,
                carbs: Number(s.carbs) || 0,
                protein: Number(s.protein) || 0,
                fiber: Number(s.fiber) || 0,
                is_default: s.is_default,
                sort_order: s.sort_order,
              }),
            });
          } else if (!s._deleted && s.id) {
            await fetch(`/api/food/items/${item!.id}/servings/${s.id}`, {
              method: "PATCH",
              headers: jsonHeaders,
              body: JSON.stringify({
                label: s.label.trim(),
                calories: Number(s.calories) || 0,
                fat: Number(s.fat) || 0,
                carbs: Number(s.carbs) || 0,
                protein: Number(s.protein) || 0,
                fiber: Number(s.fiber) || 0,
                is_default: s.is_default,
                sort_order: s.sort_order,
              }),
            });
          }
        }
      }

      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const activeServings = servings.filter((s) => !s._deleted);

  return (
    <div ref={overlayRef} onClick={handleOverlayClick}
      className="fixed inset-0 z-50 bg-black/50 flex justify-end">
      <div className="w-full max-w-md bg-background h-full overflow-y-auto shadow-xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-base font-semibold">
              {!isEditing ? "Add Custom Food" : isGlobal ? "Manage Servings" : "Edit Food"}
            </h2>
            {isGlobal && (
              <p className="text-xs text-muted-foreground mt-0.5">{item!.name}</p>
            )}
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 px-4 py-4 space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{error}</div>
          )}

          {/* Name / category — only for new or custom foods */}
          {!isGlobal && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Name <span className="text-destructive">*</span>
                </label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Chicken Breast"
                  className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background">
                  {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Sub-category <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input type="text" value={subCategory} onChange={(e) => setSubCategory(e.target.value)}
                  placeholder="e.g. Poultry"
                  className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Note <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Any notes..."
                  className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background" />
              </div>
            </>
          )}

          {/* Servings section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                Servings {!isGlobal && <span className="text-destructive">*</span>}
              </label>
              <button type="button" onClick={addServing} className="text-xs text-primary hover:underline">
                + Add Serving
              </button>
            </div>

            {isGlobal && activeServings.filter(s => s.is_global).length > 0 && (
              <p className="text-xs text-muted-foreground mb-2">
                Standard servings are read-only. Add your own below.
              </p>
            )}

            {activeServings.length === 0 && (
              <p className="text-xs text-muted-foreground">No servings. Add at least one.</p>
            )}

            {servings.map((serving, index) => {
              if (serving._deleted) return null;
              const isReadOnly = serving.is_global;
              return (
                <div key={index}
                  className={`border rounded-lg p-3 mb-2 ${
                    isReadOnly
                      ? "bg-muted/40 opacity-70"
                      : serving.is_default
                      ? "border-primary/50 bg-primary/5"
                      : "bg-card"
                  }`}
                >
                  {/* Label row */}
                  <div className="flex items-center gap-2 mb-2">
                    {isReadOnly ? (
                      <span className="flex-1 text-sm px-2 py-1">{serving.label}</span>
                    ) : (
                      <input type="text" value={serving.label}
                        onChange={(e) => updateServing(index, "label", e.target.value)}
                        placeholder="Label (e.g. 100g)"
                        className="flex-1 h-8 px-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background" />
                    )}
                    {!isReadOnly && (
                      <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                        <input type="radio" name="default-serving" checked={serving.is_default}
                          onChange={() => setDefault(index)} className="accent-primary" />
                        Default
                      </label>
                    )}
                    {isReadOnly && (
                      <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                        Standard
                      </span>
                    )}
                    {!isReadOnly && activeServings.filter(s => !s.is_global).length > (isGlobal ? 0 : 1) && (
                      <button type="button" onClick={() => removeServing(index)}
                        className="text-destructive hover:text-destructive/80 p-0.5" title="Remove">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    )}
                    {!isReadOnly && isGlobal && serving.id && (
                      <button type="button" onClick={() => removeServing(index)}
                        className="text-destructive hover:text-destructive/80 p-0.5" title="Remove">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Macro grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { key: "calories", label: "Calories" },
                        { key: "protein", label: "Protein (g)" },
                        { key: "carbs", label: "Carbs (g)" },
                        { key: "fat", label: "Fat (g)" },
                        { key: "fiber", label: "Fiber (g)" },
                      ] as const
                    ).map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-xs text-muted-foreground block mb-0.5">{label}</label>
                        {isReadOnly ? (
                          <span className="block text-sm px-2 py-1">{serving[key]}</span>
                        ) : (
                          <input type="number" min="0" step="0.1" value={serving[key]}
                            onChange={(e) => updateServing(index, key, e.target.value)}
                            placeholder="0"
                            className="w-full h-8 px-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex gap-2 sticky bottom-0 bg-background">
          <button type="button" onClick={onClose}
            className="flex-1 h-9 border rounded-lg text-sm hover:bg-accent transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Food"}
          </button>
        </div>
      </div>
    </div>
  );
}
