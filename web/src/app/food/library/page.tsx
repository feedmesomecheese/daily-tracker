"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { FoodLibraryRow, type FoodItem } from "@/app/food/components/FoodLibraryRow";
import { FoodItemForm } from "@/app/food/components/FoodItemForm";
import TemplateEditorSheet from "@/app/food/components/TemplateEditorSheet";

type Category =
  | "All"
  | "Favorites"
  | "Meat"
  | "Dairy"
  | "Grains"
  | "Plants"
  | "Misc"
  | "Custom";

const CATEGORY_TABS: Category[] = [
  "All",
  "Favorites",
  "Meat",
  "Dairy",
  "Grains",
  "Plants",
  "Misc",
  "Custom",
];

type LibraryTab = "foods" | "templates" | "day templates";

interface TemplateSummary {
  id: string;
  name: string;
  created_at: string;
  item_count: number;
  total_calories: number;
  total_protein: number;
  total_fat: number;
  total_carbs: number;
}

interface DayTemplateSummary {
  id: string;
  name: string;
  created_at: string;
  meal_count: number;
  item_count: number;
  total_calories: number;
  total_protein: number;
  total_fat: number;
  total_carbs: number;
}

const API_CATEGORIES = new Set(["Meat", "Dairy", "Grains", "Plants", "Misc"]);

export default function FoodLibraryPage() {
  const [tab, setTab] = useState<LibraryTab>("foods");

  // --- Foods tab state ---
  const [items, setItems] = useState<FoodItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<FoodItem[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);

  // --- Templates tab state ---
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // --- Day Templates tab state ---
  const [dayTemplates, setDayTemplates] = useState<DayTemplateSummary[]>([]);
  const [dayTemplatesLoading, setDayTemplatesLoading] = useState(false);
  const [dayTemplatesError, setDayTemplatesError] = useState<string | null>(null);
  const [deletingDayTemplateId, setDeletingDayTemplateId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Fetch from API
  const fetchItems = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ limit: "100" });

      if (debouncedQuery) params.set("q", debouncedQuery);

      // Only pass category param for real API categories
      if (API_CATEGORIES.has(category)) {
        params.set("category", category);
      }

      const res = await fetch(`/api/food/items?${params}`, { headers });
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || "Failed to load food library");

      const fetched: FoodItem[] = json.items ?? json ?? [];
      setItems(fetched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load food library");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, category]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Client-side filtering for Favorites / Custom
  useEffect(() => {
    if (category === "Favorites") {
      setFilteredItems(items.filter((item) => item.is_favorited));
    } else if (category === "Custom") {
      setFilteredItems(items.filter((item) => item.is_custom));
    } else {
      setFilteredItems(items);
    }
  }, [items, category]);

  // Toggle favorite
  const handleFavoriteToggle = async (id: string, currentlyFavorited: boolean) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, is_favorited: !currentlyFavorited } : item
      )
    );
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/items/${id}/favorite`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorited: !currentlyFavorited }),
      });
      if (!res.ok) {
        // Revert on failure
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, is_favorited: currentlyFavorited } : item
          )
        );
      }
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, is_favorited: currentlyFavorited } : item
        )
      );
    }
  };

  const openEdit = (item: FoodItem) => {
    setEditingItem(item);
  };

  const handleFormSaved = () => {
    fetchItems();
  };

  const handleFormClose = () => {
    setShowAddForm(false);
    setEditingItem(null);
  };

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/food/templates", { headers });
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      setTemplatesError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "templates") fetchTemplates();
    if (tab === "day templates") fetchDayTemplates();
  }, [tab, fetchTemplates]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDayTemplates = useCallback(async () => {
    setDayTemplatesLoading(true);
    setDayTemplatesError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/food/day-templates", { headers });
      if (!res.ok) throw new Error("Failed to load day templates");
      const data = await res.json();
      setDayTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      setDayTemplatesError(e instanceof Error ? e.message : "Failed to load day templates");
    } finally {
      setDayTemplatesLoading(false);
    }
  }, []);

  const deleteDayTemplate = async (id: string) => {
    setDeletingDayTemplateId(id);
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/day-templates/${id}`, { method: "DELETE", headers });
      setDayTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // ignore
    } finally {
      setDeletingDayTemplateId(null);
    }
  };

  const deleteTemplate = async (id: string) => {
    setDeletingTemplateId(id);
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/templates/${id}`, { method: "DELETE", headers });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // ignore
    } finally {
      setDeletingTemplateId(null);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Food Library</h1>
        {tab === "foods" && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + Add Custom Food
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 overflow-x-auto no-scrollbar">
        {(["foods", "templates", "day templates"] as LibraryTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap capitalize transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Foods tab ── */}
      {tab === "foods" && (
        <>
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods..."
              className="w-full h-10 px-4 pr-9 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>

          {/* Category tabs */}
          <div className="flex gap-1 overflow-x-auto mt-3 mb-4 pb-1 no-scrollbar">
            {CATEGORY_TABS.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors ${
                  category === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {loading && (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-card border rounded-lg p-3 h-[64px] animate-pulse" />
              ))}
            </div>
          )}

          {!loading && filteredItems.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">
                {query
                  ? `No foods matching "${query}"`
                  : category === "Favorites"
                  ? "No favorites yet"
                  : category === "Custom"
                  ? "No custom foods yet"
                  : "No foods found"}
              </p>
              {category === "Custom" && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="mt-3 px-4 py-2 border rounded-lg text-sm hover:bg-accent transition-colors"
                >
                  Add your first custom food
                </button>
              )}
            </div>
          )}

          {!loading && filteredItems.length > 0 && (
            <div>
              {filteredItems.map((item) => (
                <FoodLibraryRow
                  key={item.id}
                  item={item}
                  onFavoriteToggle={handleFavoriteToggle}
                  onEdit={() => openEdit(item)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Templates tab ── */}
      {tab === "templates" && (
        <>
          {templatesLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border rounded-lg p-3 h-[72px] animate-pulse" />
              ))}
            </div>
          )}

          {templatesError && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
              {templatesError}
            </div>
          )}

          {!templatesLoading && !templatesError && templates.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">No meal templates yet.</p>
              <p className="text-muted-foreground text-xs mt-1">
                Save a meal as a template from the food log.
              </p>
            </div>
          )}

          {!templatesLoading && templates.length > 0 && (
            <div className="space-y-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="bg-card border rounded-lg px-4 py-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.item_count} item{t.item_count !== 1 ? "s" : ""}
                      {t.total_calories > 0 && (
                        <> · {Math.round(t.total_calories)} cal · P{Math.round(t.total_protein)}g C{Math.round(t.total_carbs)}g F{Math.round(t.total_fat)}g</>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingTemplateId(t.id)}
                      className="px-2.5 py-1 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      disabled={deletingTemplateId === t.id}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
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
          )}
        </>
      )}

      {/* ── Day Templates tab ── */}
      {tab === "day templates" && (
        <>
          {dayTemplatesLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border rounded-lg p-3 h-[72px] animate-pulse" />
              ))}
            </div>
          )}

          {dayTemplatesError && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
              {dayTemplatesError}
            </div>
          )}

          {!dayTemplatesLoading && !dayTemplatesError && dayTemplates.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">No day templates yet.</p>
              <p className="text-muted-foreground text-xs mt-1">
                Save a full day from the food log using "Save day as template".
              </p>
            </div>
          )}

          {!dayTemplatesLoading && dayTemplates.length > 0 && (
            <div className="space-y-2">
              {dayTemplates.map((t) => (
                <div
                  key={t.id}
                  className="bg-card border rounded-lg px-4 py-3 flex items-start gap-3"
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
                  <button
                    onClick={() => deleteDayTemplate(t.id)}
                    disabled={deletingDayTemplateId === t.id}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 shrink-0"
                    title="Delete day template"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add food form sheet */}
      {(showAddForm || editingItem) && (
        <FoodItemForm
          item={editingItem ?? undefined}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}

      {/* Template editor sheet */}
      {editingTemplateId && (
        <TemplateEditorSheet
          templateId={editingTemplateId}
          onClose={() => setEditingTemplateId(null)}
          onChanged={fetchTemplates}
        />
      )}
    </main>
  );
}
