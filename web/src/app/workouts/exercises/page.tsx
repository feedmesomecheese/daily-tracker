"use client";

import { useEffect, useState, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Category = {
  id: string;
  name: string;
  short_code: string | null;
  color: string | null;
  sort_order: number;
  is_archived: boolean;
};

type Modifier = {
  id: string;
  name: string;
  adjective_order: number;
};

type Exercise = {
  id: string;
  name: string;
  exercise_type: string;
  counts_toward_volume: boolean;
  category_ids: string[];
  available_modifier_ids: string[];
  is_archived: boolean;
  sort_order: number;
};

export default function ExerciseLibraryPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newModifierName, setNewModifierName] = useState("");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseType, setNewExerciseType] = useState("weighted");
  const [newExerciseCategories, setNewExerciseCategories] = useState<string[]>([]);
  const [newExerciseModifiers, setNewExerciseModifiers] = useState<string[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [activeTab, setActiveTab] = useState("exercises");

  // Import state
  const [modifiersCsv, setModifiersCsv] = useState("");
  const [categoriesCsv, setCategoriesCsv] = useState("");
  const [exercisesCsv, setExercisesCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();

      const [catRes, modRes, exRes] = await Promise.all([
        fetch("/api/workouts/categories?include_archived=true", { headers }),
        fetch("/api/workouts/modifiers", { headers }),
        fetch("/api/workouts/exercises?include_archived=true", { headers }),
      ]);

      if (!catRes.ok || !modRes.ok || !exRes.ok) {
        throw new Error("Failed to load data");
      }

      const [catData, modData, exData] = await Promise.all([
        catRes.json(),
        modRes.json(),
        exRes.json(),
      ]);

      setCategories(catData);
      setModifiers(modData);
      setExercises(exData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/categories", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          short_code: newCategoryCode.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to add category");
      setNewCategoryName("");
      setNewCategoryCode("");
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add category");
    }
  };

  const addModifier = async () => {
    if (!newModifierName.trim()) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/modifiers", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newModifierName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to add modifier");
      setNewModifierName("");
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add modifier");
    }
  };

  const addExercise = async () => {
    if (!newExerciseName.trim()) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/exercises", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newExerciseName.trim(),
          exercise_type: newExerciseType,
          category_ids: newExerciseCategories,
          available_modifier_ids: newExerciseModifiers,
        }),
      });
      if (!res.ok) throw new Error("Failed to add exercise");
      setNewExerciseName("");
      setNewExerciseType("weighted");
      setNewExerciseCategories([]);
      setNewExerciseModifiers([]);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add exercise");
    }
  };

  const toggleArchiveExercise = async (exercise: Exercise) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/workouts/exercises/${exercise.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: !exercise.is_archived }),
      });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update exercise");
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/workouts/categories/${id}`, {
        method: "DELETE",
        headers,
      });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete category");
    }
  };

  const deleteModifier = async (id: string) => {
    if (!confirm("Delete this modifier?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/workouts/modifiers/${id}`, {
        method: "DELETE",
        headers,
      });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete modifier");
    }
  };

  // Parse CSV into array of objects
  const parseCsv = (csv: string): Record<string, string>[] => {
    const lines = csv.trim().split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || "";
      });
      rows.push(row);
    }
    return rows;
  };

  const handleImport = async () => {
    if (!modifiersCsv.trim() && !categoriesCsv.trim() && !exercisesCsv.trim()) return;
    setImporting(true);
    setImportResult(null);

    try {
      // Parse CSVs
      const modifiers = parseCsv(modifiersCsv).map((row) => ({
        name: row.name || row.modifier,
      })).filter((m) => m.name);

      const categories = parseCsv(categoriesCsv).map((row) => ({
        name: row.name || row.category,
        short_code: row.short_code || row.code || undefined,
      })).filter((c) => c.name);

      const exercises = parseCsv(exercisesCsv).map((row) => ({
        name: row.name || row.exercise,
        exercise_type: row.exercise_type || row.type || "weighted",
        category_names: (row.categories || row.category_names || "")
          .split(";")
          .map((s: string) => s.trim())
          .filter(Boolean),
        modifier_names: (row.modifiers || row.modifier_names || "")
          .split(";")
          .map((s: string) => s.trim())
          .filter(Boolean),
      })).filter((e) => e.name);

      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/import", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ modifiers, categories, exercises }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Import failed");
      }

      const { results } = json;
      const summary = [
        `Modifiers: ${results.modifiers.imported} imported${results.modifiers.errors.length ? `, ${results.modifiers.errors.length} errors` : ""}`,
        `Categories: ${results.categories.imported} imported${results.categories.errors.length ? `, ${results.categories.errors.length} errors` : ""}`,
        `Exercises: ${results.exercises.imported} imported${results.exercises.errors.length ? `, ${results.exercises.errors.length} errors` : ""}`,
      ].join("\n");

      setImportResult(summary);
      setModifiersCsv("");
      setCategoriesCsv("");
      setExercisesCsv("");
      fetchData();
    } catch (e) {
      setImportResult(`Error: ${e instanceof Error ? e.message : "Import failed"}`);
    } finally {
      setImporting(false);
    }
  };

  const filteredExercises = exercises.filter((ex) => {
    if (!showArchived && ex.is_archived) return false;
    if (selectedCategory !== "all" && !ex.category_ids.includes(selectedCategory)) return false;
    return true;
  });

  const getCategoryName = (id: string) => categories.find((c) => c.id === id)?.name || id;

  if (loading) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Exercise Library</h1>
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exercise Library</h1>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="exercises">Exercises</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="modifiers">Modifiers</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>

        {/* Exercises Tab */}
        <TabsContent value="exercises" className="space-y-4">
          {/* Add Exercise Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Exercise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Exercise name..."
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExercise();
                    }
                  }}
                  className="flex-1 h-9 px-3 border rounded-md text-sm"
                />
                <Select value={newExerciseType} onValueChange={setNewExerciseType}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weighted">Weighted</SelectItem>
                    <SelectItem value="bodyweight">Bodyweight</SelectItem>
                    <SelectItem value="cardio_hiit">HIIT</SelectItem>
                    <SelectItem value="cardio_zone2">Zone 2</SelectItem>
                    <SelectItem value="sport">Sport</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center">Categories:</span>
                {categories.filter((c) => !c.is_archived).map((cat) => (
                  <label key={cat.id} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={newExerciseCategories.includes(cat.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewExerciseCategories([...newExerciseCategories, cat.id]);
                        } else {
                          setNewExerciseCategories(newExerciseCategories.filter((c) => c !== cat.id));
                        }
                      }}
                    />
                    {cat.name}
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center">Modifiers:</span>
                {modifiers.map((mod) => (
                  <label key={mod.id} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={newExerciseModifiers.includes(mod.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewExerciseModifiers([...newExerciseModifiers, mod.id]);
                        } else {
                          setNewExerciseModifiers(newExerciseModifiers.filter((m) => m !== mod.id));
                        }
                      }}
                    />
                    {mod.name}
                  </label>
                ))}
              </div>

              <Button onClick={addExercise} size="sm">
                Add Exercise
              </Button>
            </CardContent>
          </Card>

          {/* Exercise List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Exercises ({filteredExercises.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.filter((c) => !c.is_archived).map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                    />
                    Archived
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredExercises.map((ex) => (
                  <div
                    key={ex.id}
                    className={`flex items-center justify-between p-2 border rounded ${
                      ex.is_archived ? "opacity-50" : ""
                    }`}
                  >
                    <div>
                      <span className="font-medium">{ex.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {ex.exercise_type}
                      </span>
                      {ex.category_ids.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {ex.category_ids.map(getCategoryName).join(", ")}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleArchiveExercise(ex)}
                    >
                      {ex.is_archived ? "Restore" : "Archive"}
                    </Button>
                  </div>
                ))}
                {filteredExercises.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No exercises found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Category name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                  className="flex-1 h-9 px-3 border rounded-md text-sm"
                />
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Code"
                    value={newCategoryCode}
                    onChange={(e) => setNewCategoryCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCategory();
                      }
                    }}
                    className="w-20 h-9 px-3 border rounded-md text-sm"
                    title="Optional short code (e.g., S for Squat, BA for Bench Accessories)"
                  />
                </div>
                <Button onClick={addCategory} size="sm">
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Code is an optional short abbreviation (e.g., S, BA, DL).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Categories ({categories.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-2 border rounded"
                  >
                    <div>
                      <span className="font-medium">{cat.name}</span>
                      {cat.short_code && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({cat.short_code})
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCategory(cat.id)}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No categories yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Modifiers Tab */}
        <TabsContent value="modifiers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Modifier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Modifier name (e.g., Banded)..."
                  value={newModifierName}
                  onChange={(e) => setNewModifierName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addModifier();
                    }
                  }}
                  className="flex-1 h-9 px-3 border rounded-md text-sm"
                />
                <Button onClick={addModifier} size="sm">
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Modifiers appear in the order shown below. Drag to reorder (coming soon).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Modifiers ({modifiers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {modifiers.map((mod, index) => (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between p-2 border rounded"
                  >
                    <div>
                      <span className="text-xs text-muted-foreground mr-2">
                        {index + 1}.
                      </span>
                      <span className="font-medium">{mod.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteModifier(mod.id)}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
                {modifiers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No modifiers yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import from CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Paste CSV data below. Import runs in order: Modifiers → Categories → Exercises. Duplicates (by name) are skipped.
              </p>

              {/* Modifiers CSV */}
              <div>
                <label className="text-sm font-medium">1. Modifiers</label>
                <p className="text-xs text-muted-foreground mb-1">Columns: name</p>
                <textarea
                  value={modifiersCsv}
                  onChange={(e) => setModifiersCsv(e.target.value)}
                  placeholder={`name
Banded
Pause
Raised Heel
Reverse Band
Tempo`}
                  rows={5}
                  className="w-full px-3 py-2 border rounded-md text-sm font-mono resize-none"
                />
              </div>

              {/* Categories CSV */}
              <div>
                <label className="text-sm font-medium">2. Categories</label>
                <p className="text-xs text-muted-foreground mb-1">Columns: name, short_code (optional)</p>
                <textarea
                  value={categoriesCsv}
                  onChange={(e) => setCategoriesCsv(e.target.value)}
                  placeholder={`name,short_code
Main Squat,S
Squat Accessories,SA
Main Bench,B
Bench Accessories,BA`}
                  rows={5}
                  className="w-full px-3 py-2 border rounded-md text-sm font-mono resize-none"
                />
              </div>

              {/* Exercises CSV */}
              <div>
                <label className="text-sm font-medium">3. Exercises</label>
                <p className="text-xs text-muted-foreground mb-1">
                  Columns: name, type, categories (semicolon-separated), modifiers (semicolon-separated)
                </p>
                <textarea
                  value={exercisesCsv}
                  onChange={(e) => setExercisesCsv(e.target.value)}
                  placeholder={`name,type,categories,modifiers
Squats,weighted,Main Squat,Banded;Pause;Raised Heel
Leg Press,weighted,Squat Accessories,
Bench Press,weighted,Main Bench,Banded;Pause
Air Bike HIIT,cardio_hiit,,`}
                  rows={6}
                  className="w-full px-3 py-2 border rounded-md text-sm font-mono resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleImport}
                  disabled={importing || (!modifiersCsv.trim() && !categoriesCsv.trim() && !exercisesCsv.trim())}
                >
                  {importing ? "Importing..." : "Import All"}
                </Button>
              </div>

              {importResult && (
                <pre className="text-sm p-3 bg-muted rounded-md whitespace-pre-wrap">
                  {importResult}
                </pre>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">CSV Format Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Use semicolons (;) to separate multiple categories or modifiers within a cell.</p>
              <p><strong>Exercise types:</strong> weighted, bodyweight, cardio_hiit, cardio_zone2, sport</p>
              <p>Category and modifier names must match exactly (case-insensitive) to link properly.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
