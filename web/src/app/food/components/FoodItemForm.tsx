"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import type { FoodItem } from "./FoodLibraryRow";

// ── USDA search types ─────────────────────────────────────────────
interface USDAResult {
  fdcId: number;
  name: string;
  brand: string | null;
  dataType: string;
  per100g: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
  };
}

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

  // ── USDA search state ─────────────────────────────────────────────
  const [showUSDA, setShowUSDA] = useState(false);
  const [usdaQuery, setUsdaQuery] = useState("");
  const [usdaResults, setUsdaResults] = useState<USDAResult[]>([]);
  const [usdaLoading, setUsdaLoading] = useState(false);
  const [usdaError, setUsdaError] = useState<string | null>(null);
  const usdaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── USDA serving configurator state ──────────────────────────────
  const [usdaPicked, setUsdaPicked] = useState<USDAResult | null>(null);
  const [usdaPortions, setUsdaPortions] = useState<{ label: string; grams: number }[]>([]);
  const [usdaPortionsLoading, setUsdaPortionsLoading] = useState(false);
  // Current serving being configured
  const [cfgGrams, setCfgGrams] = useState("113"); // default 4 oz
  const [cfgLabel, setCfgLabel] = useState("4 oz");
  // Staged servings to import
  const [stagedServings, setStagedServings] = useState<{ label: string; grams: number }[]>([]);

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

  // ── USDA search ──────────────────────────────────────────────────

  const searchUSDA = useCallback(async (q: string) => {
    if (!q.trim()) { setUsdaResults([]); return; }
    setUsdaLoading(true);
    setUsdaError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/usda/search?q=${encodeURIComponent(q)}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Search failed");
      setUsdaResults(json.results ?? []);
    } catch (e: unknown) {
      setUsdaError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setUsdaLoading(false);
    }
  }, []);

  const handleUsdaQueryChange = (q: string) => {
    setUsdaQuery(q);
    if (usdaDebounceRef.current) clearTimeout(usdaDebounceRef.current);
    usdaDebounceRef.current = setTimeout(() => searchUSDA(q), 400);
  };

  // Step 2: user picked a result — open serving configurator
  const pickUSDAResult = async (result: USDAResult) => {
    setUsdaPicked(result);
    setStagedServings([]);
    setCfgGrams("113");
    setCfgLabel("4 oz");
    // Fetch USDA named portions in background
    setUsdaPortions([]);
    setUsdaPortionsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/usda/food/${result.fdcId}`, { headers });
      const json = await res.json();
      setUsdaPortions(json.portions ?? []);
    } catch {
      // Non-fatal — user can still use manual sizes
    } finally {
      setUsdaPortionsLoading(false);
    }
  };

  // Scale macros from per-100g base to target grams
  const scaleNutrient = (per100: number, grams: number) =>
    Math.round(per100 * (grams / 100) * 10) / 10;

  const cfgGramsNum = parseFloat(cfgGrams) || 0;

  // Quick-pick a portion size
  const applyPortionPreset = (label: string, grams: number) => {
    setCfgLabel(label);
    setCfgGrams(String(grams));
  };

  // Add the current configured serving to the staged list
  const stageServing = () => {
    if (!cfgGramsNum || !cfgLabel.trim()) return;
    setStagedServings((prev) => [...prev, { label: cfgLabel.trim(), grams: cfgGramsNum }]);
  };

  const removeStagedServing = (i: number) => {
    setStagedServings((prev) => prev.filter((_, idx) => idx !== i));
  };

  // Step 3: commit — set form fields from picked result + staged servings
  const importUSDAResult = () => {
    if (!usdaPicked) return;
    const result = usdaPicked;

    const titleCase = result.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    setName(titleCase);

    const lower = result.name.toLowerCase();
    if (/chicken|beef|pork|turkey|fish|salmon|tuna|shrimp|lamb|bison|venison|flounder|cod|tilapia|halibut|bass|trout|crab|lobster|clam|oyster|scallop|anchov|sardine|herring|mackerel|catfish|perch|pike|walleye|whiting|haddock|pollock|snapper|grouper|mahi|swordfish/.test(lower)) {
      setCategory("Meat");
    } else if (/milk|cheese|yogurt|cream|butter|dairy|whey|casein/.test(lower)) {
      setCategory("Dairy");
    } else if (/bread|rice|oat|wheat|pasta|flour|corn|barley|rye|cereal|grain|tortilla|bagel|cracker|pretzel|granola/.test(lower)) {
      setCategory("Grains");
    } else if (/apple|banana|orange|grape|berry|broccoli|spinach|lettuce|carrot|tomato|potato|onion|pepper|bean|lentil|pea|nut|seed|vegetable|fruit|avocado|cucumber|zucchini|squash|mushroom|cabbage|kale|celery/.test(lower)) {
      setCategory("Plants");
    } else {
      setCategory("Misc");
    }

    // Build serving rows from staged list (or fall back to 100g if nothing staged)
    const toImport = stagedServings.length > 0 ? stagedServings : [{ label: "100g", grams: 100 }];
    setServings(toImport.map((s, i) => ({
      label: s.label,
      calories: String(scaleNutrient(result.per100g.calories, s.grams)),
      protein:  String(scaleNutrient(result.per100g.protein,  s.grams)),
      fat:      String(scaleNutrient(result.per100g.fat,      s.grams)),
      carbs:    String(scaleNutrient(result.per100g.carbs,    s.grams)),
      fiber:    String(scaleNutrient(result.per100g.fiber,    s.grams)),
      is_default: i === 0,
      sort_order: i,
      is_global: false,
    })));

    // Reset USDA state
    setShowUSDA(false);
    setUsdaPicked(null);
    setUsdaQuery("");
    setUsdaResults([]);
    setStagedServings([]);
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

          {/* USDA search — only when creating a new food */}
          {!isEditing && (
            <div>
              {/* Step 0: collapsed button */}
              {!showUSDA && !usdaPicked && (
                <button
                  type="button"
                  onClick={() => setShowUSDA(true)}
                  className="w-full h-9 border border-dashed rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Search USDA Database
                </button>
              )}

              {/* Step 1: search results */}
              {showUSDA && !usdaPicked && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="shrink-0 text-muted-foreground">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={usdaQuery}
                      onChange={(e) => handleUsdaQueryChange(e.target.value)}
                      placeholder="Search USDA (e.g. flounder, chicken breast...)"
                      autoFocus
                      className="flex-1 text-sm bg-transparent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => { setShowUSDA(false); setUsdaQuery(""); setUsdaResults([]); setUsdaError(null); }}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      Cancel
                    </button>
                  </div>

                  {usdaLoading && (
                    <div className="px-3 py-3 text-xs text-muted-foreground">Searching...</div>
                  )}
                  {usdaError && (
                    <div className="px-3 py-2 text-xs text-destructive">{usdaError}</div>
                  )}
                  {!usdaLoading && usdaResults.length === 0 && usdaQuery.trim() && !usdaError && (
                    <div className="px-3 py-3 text-xs text-muted-foreground">No results found.</div>
                  )}
                  {!usdaLoading && !usdaQuery.trim() && (
                    <div className="px-3 py-3 text-xs text-muted-foreground">Type to search the USDA FoodData Central database.</div>
                  )}

                  {usdaResults.length > 0 && (
                    <ul className="max-h-56 overflow-y-auto divide-y">
                      {usdaResults.map((result) => (
                        <li key={result.fdcId}>
                          <button
                            type="button"
                            onClick={() => pickUSDAResult(result)}
                            className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors"
                          >
                            <div className="text-sm font-medium leading-snug">
                              {result.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                              <span>{result.per100g.calories} cal</span>
                              <span>P{result.per100g.protein}g</span>
                              <span>C{result.per100g.carbs}g</span>
                              <span>F{result.per100g.fat}g</span>
                              {result.brand && <span className="truncate max-w-[120px]">· {result.brand}</span>}
                              <span className="ml-auto text-muted-foreground/60 shrink-0">{result.dataType}</span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Step 2: serving configurator */}
              {usdaPicked && (
                <div className="border rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <div className="text-sm font-medium truncate">
                      {usdaPicked.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUsdaPicked(null); setShowUSDA(true); }}
                      className="text-xs text-muted-foreground hover:text-foreground shrink-0 ml-2"
                    >
                      ← Back
                    </button>
                  </div>

                  <div className="px-3 py-3 space-y-3">
                    {/* Per-100g reference */}
                    <div className="text-xs text-muted-foreground">
                      Per 100g: {usdaPicked.per100g.calories} cal · P{usdaPicked.per100g.protein}g · C{usdaPicked.per100g.carbs}g · F{usdaPicked.per100g.fat}g
                    </div>

                    {/* Quick presets */}
                    <div>
                      <div className="text-xs text-muted-foreground mb-1.5">Common sizes</div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: "1 oz", grams: 28.35 },
                          { label: "2 oz", grams: 56.7 },
                          { label: "3 oz", grams: 85.05 },
                          { label: "4 oz", grams: 113.4 },
                          { label: "5 oz", grams: 141.75 },
                          { label: "6 oz", grams: 170.1 },
                          { label: "8 oz", grams: 226.8 },
                          { label: "100g", grams: 100 },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => applyPortionPreset(p.label, p.grams)}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                              cfgLabel === p.label
                                ? "bg-primary text-primary-foreground border-primary"
                                : "hover:bg-accent"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* USDA named portions */}
                    {(usdaPortionsLoading || usdaPortions.length > 0) && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1.5">
                          {usdaPortionsLoading ? "Loading USDA portions..." : "USDA portions"}
                        </div>
                        {!usdaPortionsLoading && (
                          <div className="flex flex-wrap gap-1.5">
                            {usdaPortions.map((p) => (
                              <button
                                key={`${p.label}-${p.grams}`}
                                type="button"
                                onClick={() => applyPortionPreset(p.label, p.grams)}
                                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                  cfgLabel === p.label
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "hover:bg-accent"
                                }`}
                              >
                                {p.label} <span className="opacity-60">({p.grams}g)</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Custom label + grams */}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">Label</label>
                        <input
                          type="text"
                          value={cfgLabel}
                          onChange={(e) => setCfgLabel(e.target.value)}
                          placeholder="e.g. 4 oz fillet"
                          className="w-full h-8 px-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-xs text-muted-foreground block mb-1">Grams</label>
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={cfgGrams}
                          onChange={(e) => setCfgGrams(e.target.value)}
                          className="w-full h-8 px-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background"
                        />
                      </div>
                    </div>

                    {/* Live macro preview */}
                    {cfgGramsNum > 0 && (
                      <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs flex gap-3">
                        <span className="font-medium">{scaleNutrient(usdaPicked.per100g.calories, cfgGramsNum)} cal</span>
                        <span>P {scaleNutrient(usdaPicked.per100g.protein, cfgGramsNum)}g</span>
                        <span>C {scaleNutrient(usdaPicked.per100g.carbs, cfgGramsNum)}g</span>
                        <span>F {scaleNutrient(usdaPicked.per100g.fat, cfgGramsNum)}g</span>
                        <span>Fiber {scaleNutrient(usdaPicked.per100g.fiber, cfgGramsNum)}g</span>
                      </div>
                    )}

                    {/* Add to staged list */}
                    <button
                      type="button"
                      onClick={stageServing}
                      disabled={!cfgGramsNum || !cfgLabel.trim()}
                      className="w-full h-8 border rounded-lg text-xs hover:bg-accent transition-colors disabled:opacity-40"
                    >
                      + Add this serving size
                    </button>

                    {/* Staged servings */}
                    {stagedServings.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Servings to import:</div>
                        {stagedServings.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-xs bg-primary/5 border border-primary/20 rounded px-2.5 py-1.5">
                            <span className="font-medium">{s.label}</span>
                            <span className="text-muted-foreground mx-2">
                              {scaleNutrient(usdaPicked.per100g.calories, s.grams)} cal · P{scaleNutrient(usdaPicked.per100g.protein, s.grams)}g
                            </span>
                            <button type="button" onClick={() => removeStagedServing(i)}
                              className="text-muted-foreground hover:text-destructive ml-auto">×</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Import button */}
                    <button
                      type="button"
                      onClick={importUSDAResult}
                      className="w-full h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      {stagedServings.length > 0
                        ? `Import with ${stagedServings.length} serving${stagedServings.length > 1 ? "s" : ""}`
                        : "Import with 100g serving"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Name / category — only for new or custom foods, hidden while USDA configurator is open */}
          {!isGlobal && !(showUSDA || usdaPicked) && (
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

          {/* Servings section — hidden while USDA configurator is open for new foods */}
          {!((!isEditing) && (showUSDA || usdaPicked)) && <div>
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
          </div>}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex gap-2 sticky bottom-0 bg-background">
          <button type="button" onClick={onClose}
            className="flex-1 h-9 border rounded-lg text-sm hover:bg-accent transition-colors">
            Cancel
          </button>
          {!((!isEditing) && (showUSDA || usdaPicked)) && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex-1 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Food"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
