"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getAuthHeaders } from "@/lib/authHeaders";
import { FoodMacroDonut } from "./FoodMacroDonut";
import { GIPill } from "./GIPill";

interface FoodServing {
  id: string;
  label: string;
  calories: number;
  fat: number;
  carbs: number;
  protein: number;
  fiber: number;
  is_default: boolean;
}

interface FoodItem {
  id: string;
  name: string;
  category: string | null;
  is_favorited: boolean;
  glycemic_index?: number | null;
  servings: FoodServing[];
}

// A virtual serving is derived from a real one (e.g. "1 oz" from "4 oz raw")
// It carries pre-scaled per-unit macros and posts with food_item_serving_id = null
interface VirtualServing {
  virtualId: string;       // "v_{realId}_{unit}" — used as option value in select
  realServingId: string;
  label: string;           // "1 oz"
  unit: string;
  calories: number;
  fat: number;
  carbs: number;
  protein: number;
  fiber: number;
  is_default: false;
}

type SelectableServing =
  | (FoodServing & { isVirtual?: false })
  | (VirtualServing & { isVirtual: true });

interface AddPayload {
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
}

interface Props {
  open: boolean;
  onClose: () => void;
  logId?: string;
  mealId: string;
  onAdded: () => void;
  /** Optional override: called instead of the default log-item POST */
  onAdd?: (payload: AddPayload) => Promise<void>;
  title?: string;
}

// ── Unit parsing ─────────────────────────────────────────────────────────────

const UNIT_PATTERNS: { unit: string; regex: RegExp }[] = [
  { unit: "oz",   regex: /(\d+(?:\.\d+)?|\d+\/\d+)\s*oz\b/i },
  { unit: "g",    regex: /(\d+(?:\.\d+)?)\s*g\b/i },
  { unit: "tbsp", regex: /(\d+(?:\.\d+)?|\d+\/\d+)\s*tbsp\b/i },
  { unit: "tsp",  regex: /(\d+(?:\.\d+)?|\d+\/\d+)\s*tsp\b/i },
  { unit: "cup",  regex: /(\d+(?:\.\d+)?|\d+\/\d+)\s*cup/i },
  { unit: "ml",   regex: /(\d+(?:\.\d+)?)\s*ml\b/i },
];

function parseFraction(s: string): number {
  if (s.includes("/")) {
    const [n, d] = s.split("/");
    return parseFloat(n) / parseFloat(d);
  }
  return parseFloat(s);
}

function deriveVirtualServing(serving: FoodServing): VirtualServing | null {
  for (const { unit, regex } of UNIT_PATTERNS) {
    const match = serving.label.match(regex);
    if (!match) continue;
    const baseQty = parseFraction(match[1]);
    if (!baseQty || isNaN(baseQty) || baseQty <= 0) continue;
    // Don't create "1 oz" when the serving is already exactly "1 oz"
    if (baseQty === 1 && serving.label.toLowerCase().startsWith("1 " + unit)) continue;
    const scale = 1 / baseQty;
    return {
      virtualId: `v_${serving.id}_${unit}`,
      realServingId: serving.id,
      label: `1 ${unit}`,
      unit,
      calories: serving.calories * scale,
      fat:      serving.fat      * scale,
      carbs:    serving.carbs    * scale,
      protein:  serving.protein  * scale,
      fiber:    serving.fiber    * scale,
      is_default: false,
    };
  }
  return null;
}

function buildSelectableServings(food: FoodItem): SelectableServing[] {
  const result: SelectableServing[] = [];
  const addedUnits = new Set<string>();

  for (const s of food.servings) {
    result.push({ ...s, isVirtual: false });
    const virtual = deriveVirtualServing(s);
    if (virtual && !addedUnits.has(virtual.unit)) {
      addedUnits.add(virtual.unit);
      result.push({ ...virtual, isVirtual: true });
    }
  }
  return result;
}

// ── Food row (used in both search results and starred section) ─────────────

function FoodSearchRow({ food, onSelect }: { food: FoodItem; onSelect: (food: FoodItem) => void }) {
  const defaultServing = food.servings.find((s) => s.is_default) ?? food.servings[0];
  return (
    <button
      onClick={() => onSelect(food)}
      className="w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition-colors flex items-center gap-2.5"
    >
      {defaultServing && (
        <FoodMacroDonut
          protein={defaultServing.protein}
          carbs={defaultServing.carbs}
          fat={defaultServing.fat}
          size={26}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{food.name}</span>
          {food.glycemic_index != null && <GIPill gi={food.glycemic_index} />}
          {food.is_favorited && <span className="text-amber-400 text-xs leading-none">★</span>}
        </div>
        {food.category && (
          <div className="text-xs text-muted-foreground">{food.category}</div>
        )}
        {defaultServing && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {defaultServing.label} &middot; {Math.round(defaultServing.calories)} cal &middot; P{Math.round(defaultServing.protein)}g C{Math.round(defaultServing.carbs)}g F{Math.round(defaultServing.fat)}g
          </div>
        )}
      </div>
    </button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FoodSearchSheet({ open, onClose, logId, mealId, onAdded, onAdd, title = "Add Food" }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [favorites, setFavorites] = useState<FoodItem[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [allServings, setAllServings] = useState<SelectableServing[]>([]);
  const [selectedServingId, setSelectedServingId] = useState<string>("");
  const [qtyStr, setQtyStr] = useState("1");
  const qty = parseFloat(qtyStr) || 0;
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [open]);

  // Load favorited items once when the sheet first opens
  useEffect(() => {
    if (!open || favoritesLoaded) return;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/food/items?limit=100", { headers });
        if (res.ok) {
          const data = await res.json();
          const all: FoodItem[] = Array.isArray(data) ? data : data.items ?? [];
          setFavorites(all.filter((f) => f.is_favorited).sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch { /* best-effort */ }
      setFavoritesLoaded(true);
    })();
  }, [open, favoritesLoaded]);

  useEffect(() => {
    setSelectedFood(null);
    setAllServings([]);
    setSelectedServingId("");
    setQtyStr("1");
    setAddError(null);
  }, [mealId]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/items?q=${encodeURIComponent(q.trim())}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : data.items ?? []);
      }
    } catch { /* best-effort */ }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const handleSelectFood = (food: FoodItem) => {
    const servings = buildSelectableServings(food);
    const defaultServing =
      servings.find((s) => !s.isVirtual && (s as FoodServing).is_default) ?? servings[0];
    setSelectedFood(food);
    setAllServings(servings);
    setSelectedServingId(defaultServing?.isVirtual ? defaultServing.virtualId : defaultServing?.id ?? "");
    setQtyStr("1");
    setAddError(null);
  };

  const selectedServing = allServings.find((s) =>
    s.isVirtual ? s.virtualId === selectedServingId : s.id === selectedServingId
  ) ?? null;

  const macros = selectedServing
    ? {
        calories: Math.round(qty * selectedServing.calories * 10) / 10,
        protein:  Math.round(qty * selectedServing.protein  * 10) / 10,
        carbs:    Math.round(qty * selectedServing.carbs    * 10) / 10,
        fat:      Math.round(qty * selectedServing.fat      * 10) / 10,
        fiber:    Math.round(qty * selectedServing.fiber    * 10) / 10,
      }
    : null;

  const handleAdd = async () => {
    if (!selectedFood || !selectedServing) return;
    setAdding(true);
    setAddError(null);
    try {
      const isVirtual = selectedServing.isVirtual;
      const payload: AddPayload = {
        food_item_id:           selectedFood.id,
        food_item_serving_id:   isVirtual ? null : selectedServing.id,
        food_name_snapshot:     selectedFood.name,
        serving_label_snapshot: selectedServing.label,
        qty,
        calories: qty * selectedServing.calories,
        fat:      qty * selectedServing.fat,
        carbs:    qty * selectedServing.carbs,
        protein:  qty * selectedServing.protein,
        fiber:    qty * selectedServing.fiber,
      };

      if (onAdd) {
        await onAdd(payload);
      } else {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/food/logs/${logId}/meals/${mealId}/items`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed to add item");
        }
      }
      onAdded();
      setSelectedFood(null);
      setAllServings([]);
      setSelectedServingId("");
      setQtyStr("1");
      setQuery("");
      setResults([]);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    setQuery("");
    setResults([]);
    setSelectedFood(null);
    setAllServings([]);
    setSelectedServingId("");
    setQtyStr("1");
    setAddError(null);
    setFavoritesLoaded(false);
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

      {/* Sheet panel */}
      <div
        className={cn(
          "fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background border-l border-border shadow-xl flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <path fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search foods..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">...</span>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">

          {/* Selected food detail */}
          {selectedFood && (
            <div className="px-4 pb-3 border-b border-border">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-sm font-semibold">{selectedFood.name}</div>
                  {selectedFood.category && (
                    <div className="text-xs text-muted-foreground">{selectedFood.category}</div>
                  )}
                </div>
                <button onClick={() => { setSelectedFood(null); setAllServings([]); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
                  Change
                </button>
              </div>

              {/* Serving dropdown */}
              <div className="mb-2">
                <label className="text-xs text-muted-foreground block mb-1">Serving size</label>
                <select
                  value={selectedServingId}
                  onChange={(e) => setSelectedServingId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {allServings.map((s) => {
                    const id = s.isVirtual ? s.virtualId : s.id;
                    const calDisplay = Math.round(s.calories);
                    const suffix = s.isVirtual ? ` — ${calDisplay} cal/unit` : ` — ${calDisplay} cal`;
                    return (
                      <option key={id} value={id}>
                        {s.label}{suffix}
                      </option>
                    );
                  })}
                </select>
                {selectedServing?.isVirtual && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Per-unit serving — enter any quantity below.
                  </p>
                )}
              </div>

              {/* Qty */}
              <div className="mb-3">
                <label className="text-xs text-muted-foreground block mb-1">
                  Quantity{selectedServing?.isVirtual ? ` (${selectedServing.unit}s)` : ""}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={qtyStr}
                  onFocus={(e) => { setQtyStr(""); e.target.select(); }}
                  onChange={(e) => setQtyStr(e.target.value)}
                  onBlur={() => { if (!qty || qty <= 0) setQtyStr("1"); }}
                  onKeyDown={(e) => { if (e.key === "Escape") { setQtyStr("1"); e.currentTarget.blur(); } }}
                  className="w-24 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Computed macros preview */}
              {macros && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm mb-3">
                  <div className="text-base font-semibold">
                    {macros.calories}{" "}
                    <span className="text-xs font-normal text-muted-foreground">kcal</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="text-green-500">P {macros.protein}g</span>
                    <span className="text-amber-400">C {macros.carbs}g</span>
                    <span className="text-blue-400">F {macros.fat}g</span>
                    {macros.fiber > 0 && <span className="text-purple-400">Fb {macros.fiber}g</span>}
                  </div>
                </div>
              )}

              {addError && <p className="text-xs text-destructive mb-2">{addError}</p>}

              <button
                onClick={handleAdd}
                disabled={adding || !selectedServing}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? "Adding..." : onAdd ? "Add to Template" : "Add to Meal"}
              </button>
            </div>
          )}

          {/* Search results / starred items */}
          {!selectedFood && (
            <div>
              {/* Search results */}
              {query.trim() && (
                <>
                  {results.length === 0 && !searching && (
                    <p className="text-sm text-muted-foreground text-center py-8">No results found.</p>
                  )}
                  {results.map((food) => (
                    <FoodSearchRow key={food.id} food={food} onSelect={handleSelectFood} />
                  ))}
                </>
              )}

              {/* Starred section (shown when no query) */}
              {!query.trim() && (
                <>
                  {favorites.length > 0 && (
                    <>
                      <div className="px-4 pt-3 pb-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          ★ Starred
                        </span>
                      </div>
                      {favorites.map((food) => (
                        <FoodSearchRow key={food.id} food={food} onSelect={handleSelectFood} />
                      ))}
                    </>
                  )}
                  {favoritesLoaded && favorites.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Type to search for a food item.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <button onClick={handleClose}
            className="w-full rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted transition-colors">
            Done
          </button>
        </div>
      </div>
    </>
  );
}
