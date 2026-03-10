"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { FoodLibraryRow, type FoodItem } from "@/app/food/components/FoodLibraryRow";
import { FoodItemForm } from "@/app/food/components/FoodItemForm";

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

const API_CATEGORIES = new Set(["Meat", "Dairy", "Grains", "Plants", "Misc"]);

export default function FoodLibraryPage() {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<FoodItem[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);

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

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Food Library</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          + Add Custom Food
        </button>
      </div>

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

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-card border rounded-lg p-3 h-[64px] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
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

      {/* Food list */}
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

      {/* Add form sheet */}
      {(showAddForm || editingItem) && (
        <FoodItemForm
          item={editingItem ?? undefined}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}
    </main>
  );
}
