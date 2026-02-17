"use client";

import { useEffect, useState, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import Link from "next/link";
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

type WorkoutType = {
  id: string;
  name: string;
  group_ids: string[];
  sort_order: number;
  is_archived: boolean;
};

type Group = {
  id: string;
  name: string;
  short_code: string | null;
  color: string | null;
  input_type: string;
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
  group_ids: string[];
  available_modifier_ids: string[];
  is_archived: boolean;
  sort_order: number;
  parent_exercise_id: string | null;
  parent_modifier_filter: string[] | null;
};

export default function ExerciseLibraryPage() {
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutType[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Type form states
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeGroups, setNewTypeGroups] = useState<string[]>([]);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editTypeName, setEditTypeName] = useState("");
  const [editTypeGroups, setEditTypeGroups] = useState<string[]>([]);

  // Group form states
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCode, setNewGroupCode] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupCode, setEditGroupCode] = useState("");
  const [editGroupInputType, setEditGroupInputType] = useState("strength");
  const [newGroupInputType, setNewGroupInputType] = useState("strength");

  // Modifier form
  const [newModifierName, setNewModifierName] = useState("");
  const [editingModifierId, setEditingModifierId] = useState<string | null>(null);
  const [editModifierName, setEditModifierName] = useState("");

  // Exercise edit states
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [editExerciseName, setEditExerciseName] = useState("");
  const [editExerciseType, setEditExerciseType] = useState("weighted");
  const [editExerciseGroups, setEditExerciseGroups] = useState<string[]>([]);
  const [editExerciseModifiers, setEditExerciseModifiers] = useState<string[]>([]);
  const [editExerciseParent, setEditExerciseParent] = useState<string | null>(null);
  const [editExerciseParentModFilter, setEditExerciseParentModFilter] = useState<string[]>([]);

  // Exercise form
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseType, setNewExerciseType] = useState("weighted");
  const [newExerciseGroups, setNewExerciseGroups] = useState<string[]>([]);
  const [newExerciseModifiers, setNewExerciseModifiers] = useState<string[]>([]);

  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [activeTab, setActiveTab] = useState("exercises");

  // Import state
  const [typesCsv, setTypesCsv] = useState("");
  const [exercisesCsvImport, setExercisesCsvImport] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Cycle max import state
  const [cycleMaxCsv, setCycleMaxCsv] = useState("");
  const [cycleMaxImporting, setCycleMaxImporting] = useState(false);
  const [cycleMaxResult, setCycleMaxResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();

      const [typesRes, groupRes, modRes, exRes] = await Promise.all([
        fetch("/api/workouts/types?include_archived=true", { headers }),
        fetch("/api/workouts/groups?include_archived=true", { headers }),
        fetch("/api/workouts/modifiers", { headers }),
        fetch("/api/workouts/exercises?include_archived=true", { headers }),
      ]);

      if (!groupRes.ok || !modRes.ok || !exRes.ok) {
        throw new Error("Failed to load data");
      }

      const [typesData, groupData, modData, exData] = await Promise.all([
        typesRes.ok ? typesRes.json() : [],
        groupRes.json(),
        modRes.json(),
        exRes.json(),
      ]);

      setWorkoutTypes(typesData);
      setGroups(groupData);
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

  // ── Types CRUD ──
  const addType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/types", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTypeName.trim(),
          group_ids: newTypeGroups,
        }),
      });
      if (!res.ok) throw new Error("Failed to add type");
      setNewTypeName("");
      setNewTypeGroups([]);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add type");
    }
  };

  const startEditType = (type: WorkoutType) => {
    setEditingTypeId(type.id);
    setEditTypeName(type.name);
    setEditTypeGroups([...type.group_ids]);
  };

  const saveEditType = async () => {
    if (!editingTypeId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/workouts/types/${editingTypeId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editTypeName.trim(),
          group_ids: editTypeGroups,
        }),
      });
      if (!res.ok) throw new Error("Failed to update type");
      setEditingTypeId(null);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update type");
    }
  };

  const deleteType = async (id: string) => {
    if (!confirm("Delete this workout type?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/workouts/types/${id}`, { method: "DELETE", headers });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete type");
    }
  };

  // ── Groups CRUD ──
  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/groups", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName.trim(),
          short_code: newGroupCode.trim() || null,
          input_type: newGroupInputType,
        }),
      });
      if (!res.ok) throw new Error("Failed to add group");
      setNewGroupName("");
      setNewGroupCode("");
      setNewGroupInputType("strength");
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add group");
    }
  };

  const startEditGroup = (g: Group) => {
    setEditingGroupId(g.id);
    setEditGroupName(g.name);
    setEditGroupCode(g.short_code || "");
    setEditGroupInputType(g.input_type || "strength");
  };

  const saveEditGroup = async () => {
    if (!editingGroupId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/workouts/groups/${editingGroupId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editGroupName.trim(),
          short_code: editGroupCode.trim() || null,
          input_type: editGroupInputType,
        }),
      });
      if (!res.ok) throw new Error("Failed to update group");
      setEditingGroupId(null);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update group");
    }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm("Delete this group?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/workouts/groups/${id}`, { method: "DELETE", headers });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete group");
    }
  };

  // ── Modifiers CRUD ──
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

  const startEditModifier = (mod: Modifier) => {
    setEditingModifierId(mod.id);
    setEditModifierName(mod.name);
  };

  const saveEditModifier = async () => {
    if (!editingModifierId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/workouts/modifiers/${editingModifierId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: editModifierName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to update modifier");
      setEditingModifierId(null);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update modifier");
    }
  };

  const deleteModifier = async (id: string) => {
    if (!confirm("Delete this modifier?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/workouts/modifiers/${id}`, { method: "DELETE", headers });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete modifier");
    }
  };

  // ── Exercises CRUD ──
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
          group_ids: newExerciseGroups,
          available_modifier_ids: newExerciseModifiers,
        }),
      });
      if (!res.ok) throw new Error("Failed to add exercise");
      setNewExerciseName("");
      setNewExerciseType("weighted");
      setNewExerciseGroups([]);
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

  const startEditExercise = (ex: Exercise) => {
    setEditingExerciseId(ex.id);
    setEditExerciseName(ex.name);
    setEditExerciseType(ex.exercise_type);
    setEditExerciseGroups([...ex.group_ids]);
    setEditExerciseModifiers([...ex.available_modifier_ids]);
    setEditExerciseParent(ex.parent_exercise_id);
    setEditExerciseParentModFilter(ex.parent_modifier_filter || []);
  };

  const saveEditExercise = async () => {
    if (!editingExerciseId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/workouts/exercises/${editingExerciseId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editExerciseName.trim(),
          exercise_type: editExerciseType,
          group_ids: editExerciseGroups,
          available_modifier_ids: editExerciseModifiers,
          parent_exercise_id: editExerciseParent,
          parent_modifier_filter: editExerciseParentModFilter.length > 0 ? editExerciseParentModFilter : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update exercise");
      setEditingExerciseId(null);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update exercise");
    }
  };

  const deleteExercise = async (id: string) => {
    if (!confirm("Delete this exercise permanently?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/workouts/exercises/${id}`, { method: "DELETE", headers });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete exercise");
    }
  };

  // ── Import ──
  const readFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFile(file);
    setter(text);
  };

  const handleImport = async () => {
    if (!typesCsv.trim() && !exercisesCsvImport.trim()) return;
    setImporting(true);
    setImportResult(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/import", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          types_csv: typesCsv,
          exercises_csv: exercisesCsvImport,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Import failed");
      }

      const { results } = json;
      const lines: string[] = [];

      if (results.types) {
        lines.push(`Types: ${results.types.imported} imported, ${results.types.skipped} skipped${results.types.errors.length ? `, ${results.types.errors.length} errors` : ""}`);
      }
      if (results.groups) {
        lines.push(`Groups: ${results.groups.imported} imported, ${results.groups.skipped} skipped${results.groups.errors.length ? `, ${results.groups.errors.length} errors` : ""}`);
      }
      if (results.modifiers) {
        lines.push(`Modifiers: ${results.modifiers.imported} imported, ${results.modifiers.skipped} skipped${results.modifiers.errors.length ? `, ${results.modifiers.errors.length} errors` : ""}`);
      }
      if (results.exercises) {
        lines.push(`Exercises: ${results.exercises.imported} imported, ${results.exercises.skipped} skipped${results.exercises.errors.length ? `, ${results.exercises.errors.length} errors` : ""}`);
      }

      // Show any errors
      const allErrors = [
        ...(results.types?.errors || []).map((e: string) => `  Type: ${e}`),
        ...(results.groups?.errors || []).map((e: string) => `  Group: ${e}`),
        ...(results.modifiers?.errors || []).map((e: string) => `  Modifier: ${e}`),
        ...(results.exercises?.errors || []).map((e: string) => `  Exercise: ${e}`),
      ];
      if (allErrors.length > 0) {
        lines.push("", "Errors:", ...allErrors);
      }

      setImportResult(lines.join("\n"));
      setTypesCsv("");
      setExercisesCsvImport("");
      fetchData();
    } catch (e) {
      setImportResult(`Error: ${e instanceof Error ? e.message : "Import failed"}`);
    } finally {
      setImporting(false);
    }
  };

  const filteredExercises = exercises.filter((ex) => {
    if (!showArchived && ex.is_archived) return false;
    if (selectedGroup !== "all" && !ex.group_ids.includes(selectedGroup)) return false;
    return true;
  });

  const getGroupName = (id: string) => groups.find((g) => g.id === id)?.name || id;

  const getTypesForGroup = (groupId: string) =>
    workoutTypes.filter((t) => t.group_ids.includes(groupId)).map((t) => t.name);

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
        <Link href="/workouts">
          <Button variant="outline" size="sm">Log Workout</Button>
        </Link>
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
          <TabsTrigger value="types">Types</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="modifiers">Modifiers</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>

        {/* ── Exercises Tab ── */}
        <TabsContent value="exercises" className="space-y-4">
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
                <span className="text-xs text-muted-foreground self-center">Groups:</span>
                {groups.filter((g) => !g.is_archived).map((g) => (
                  <label key={g.id} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={newExerciseGroups.includes(g.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewExerciseGroups([...newExerciseGroups, g.id]);
                        } else {
                          setNewExerciseGroups(newExerciseGroups.filter((id) => id !== g.id));
                        }
                      }}
                    />
                    {g.name}
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
                          setNewExerciseModifiers(newExerciseModifiers.filter((id) => id !== mod.id));
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

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Exercises ({filteredExercises.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Groups</SelectItem>
                      {groups.filter((g) => !g.is_archived).map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
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
                    className={`p-2 border rounded ${ex.is_archived ? "opacity-50" : ""}`}
                  >
                    {editingExerciseId === ex.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editExerciseName}
                            onChange={(e) => setEditExerciseName(e.target.value)}
                            className="flex-1 h-8 px-2 border rounded text-sm"
                            autoFocus
                          />
                          <Select value={editExerciseType} onValueChange={setEditExerciseType}>
                            <SelectTrigger className="w-[130px] h-8">
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
                          <span className="text-xs text-muted-foreground self-center">Groups:</span>
                          {groups.filter((g) => !g.is_archived).map((g) => (
                            <label key={g.id} className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={editExerciseGroups.includes(g.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditExerciseGroups([...editExerciseGroups, g.id]);
                                  } else {
                                    setEditExerciseGroups(editExerciseGroups.filter((id) => id !== g.id));
                                  }
                                }}
                              />
                              {g.name}
                            </label>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="text-xs text-muted-foreground self-center">Modifiers:</span>
                          {modifiers.map((mod) => (
                            <label key={mod.id} className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={editExerciseModifiers.includes(mod.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditExerciseModifiers([...editExerciseModifiers, mod.id]);
                                  } else {
                                    setEditExerciseModifiers(editExerciseModifiers.filter((id) => id !== mod.id));
                                  }
                                }}
                              />
                              {mod.name}
                            </label>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Parent:</span>
                            <Select
                              value={editExerciseParent || "none"}
                              onValueChange={(v) => {
                                setEditExerciseParent(v === "none" ? null : v);
                                if (v === "none") setEditExerciseParentModFilter([]);
                              }}
                            >
                              <SelectTrigger className="w-[200px] h-8">
                                <SelectValue placeholder="No parent" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No parent</SelectItem>
                                {exercises
                                  .filter((e) => e.id !== ex.id && !e.parent_exercise_id && !e.is_archived)
                                  .map((e) => (
                                    <SelectItem key={e.id} value={e.id}>
                                      {e.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {editExerciseParent && ex.available_modifier_ids.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 pl-12">
                              <span className="text-xs text-muted-foreground">Include in parent stats only with:</span>
                              {modifiers
                                .filter((mod) => ex.available_modifier_ids.includes(mod.id))
                                .map((mod) => (
                                  <label key={mod.id} className="flex items-center gap-1 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={editExerciseParentModFilter.includes(mod.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setEditExerciseParentModFilter([...editExerciseParentModFilter, mod.id]);
                                        } else {
                                          setEditExerciseParentModFilter(editExerciseParentModFilter.filter((id) => id !== mod.id));
                                        }
                                      }}
                                    />
                                    {mod.name}
                                  </label>
                                ))}
                              <span className="text-xs text-muted-foreground italic">
                                {editExerciseParentModFilter.length === 0 ? "(all sessions count toward parent)" : ""}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEditExercise}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingExerciseId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{ex.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {ex.exercise_type}
                          </span>
                          {ex.group_ids.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {ex.group_ids.map(getGroupName).join(", ")}
                            </div>
                          )}
                          {ex.parent_exercise_id && (
                            <div className="text-xs text-blue-600">
                              Linked to: {exercises.find((e) => e.id === ex.parent_exercise_id)?.name || "Unknown"}
                              {ex.parent_modifier_filter && ex.parent_modifier_filter.length > 0 && (
                                <span className="text-muted-foreground ml-1">
                                  (only with {ex.parent_modifier_filter.map((id) => modifiers.find((m) => m.id === id)?.name || id).join(", ")})
                                </span>
                              )}
                            </div>
                          )}
                          {exercises.some((e) => e.parent_exercise_id === ex.id) && (
                            <div className="text-xs text-emerald-600">
                              Children: {exercises.filter((e) => e.parent_exercise_id === ex.id).map((e) => e.name).join(", ")}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEditExercise(ex)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleArchiveExercise(ex)}>
                            {ex.is_archived ? "Restore" : "Archive"}
                          </Button>
                        </div>
                      </div>
                    )}
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

        {/* ── Types Tab ── */}
        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Workout Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type name (e.g. Bench Day)..."
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addType();
                    }
                  }}
                  className="flex-1 h-9 px-3 border rounded-md text-sm"
                />
                <Button onClick={addType} size="sm">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center">Assign groups:</span>
                {groups.filter((g) => !g.is_archived).map((g) => (
                  <label key={g.id} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={newTypeGroups.includes(g.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewTypeGroups([...newTypeGroups, g.id]);
                        } else {
                          setNewTypeGroups(newTypeGroups.filter((id) => id !== g.id));
                        }
                      }}
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workout Types ({workoutTypes.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {workoutTypes.map((type) => (
                  <div
                    key={type.id}
                    className="p-2 border rounded"
                  >
                    {editingTypeId === type.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editTypeName}
                          onChange={(e) => setEditTypeName(e.target.value)}
                          className="w-full h-8 px-2 border rounded text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          {groups.filter((g) => !g.is_archived).map((g) => (
                            <label key={g.id} className="flex items-center gap-1 text-sm">
                              <input
                                type="checkbox"
                                checked={editTypeGroups.includes(g.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditTypeGroups([...editTypeGroups, g.id]);
                                  } else {
                                    setEditTypeGroups(editTypeGroups.filter((id) => id !== g.id));
                                  }
                                }}
                              />
                              {g.name}
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEditType}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingTypeId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{type.name}</span>
                          {type.group_ids.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Groups: {type.group_ids.map(getGroupName).join(", ")}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditType(type)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteType(type.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {workoutTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No workout types yet. Create types like "Bench Day" or "Squat Day" and assign groups to them.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Groups Tab (renamed from Categories) ── */}
        <TabsContent value="groups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Group</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addGroup();
                    }
                  }}
                  className="flex-1 h-9 px-3 border rounded-md text-sm"
                />
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Code"
                    value={newGroupCode}
                    onChange={(e) => setNewGroupCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addGroup();
                      }
                    }}
                    className="w-20 h-9 px-3 border rounded-md text-sm"
                    title="Optional short code (e.g., S for Squat, BA for Bench Accessories)"
                  />
                </div>
                <Select value={newGroupInputType} onValueChange={setNewGroupInputType}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strength">Strength</SelectItem>
                    <SelectItem value="hiit">HIIT</SelectItem>
                    <SelectItem value="cardio">Cardio</SelectItem>
                    <SelectItem value="sport">Sport</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={addGroup} size="sm">
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Input type determines the entry fields: Strength (sets/reps/weight), HIIT (cycles/on/off), Cardio (min/miles/incline/weight), Sport (notes only).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Groups ({groups.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {groups.map((g) => {
                  const typeNames = getTypesForGroup(g.id);
                  return (
                    <div key={g.id} className="p-2 border rounded">
                      {editingGroupId === g.id ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editGroupName}
                              onChange={(e) => setEditGroupName(e.target.value)}
                              className="flex-1 h-8 px-2 border rounded text-sm"
                            />
                            <input
                              type="text"
                              value={editGroupCode}
                              onChange={(e) => setEditGroupCode(e.target.value)}
                              placeholder="Code"
                              className="w-20 h-8 px-2 border rounded text-sm"
                            />
                            <Select value={editGroupInputType} onValueChange={setEditGroupInputType}>
                              <SelectTrigger className="w-[130px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="strength">Strength</SelectItem>
                                <SelectItem value="hiit">HIIT</SelectItem>
                                <SelectItem value="cardio">Cardio</SelectItem>
                                <SelectItem value="sport">Sport</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveEditGroup}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingGroupId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">{g.name}</span>
                            {g.short_code && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({g.short_code})
                              </span>
                            )}
                            {g.input_type && g.input_type !== "strength" && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded ml-2">
                                {g.input_type}
                              </span>
                            )}
                            {typeNames.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Used in: {typeNames.join(", ")}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => startEditGroup(g)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteGroup(g.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {groups.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No groups yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Modifiers Tab ── */}
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Modifiers ({modifiers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {modifiers.map((mod, index) => (
                  <div key={mod.id} className="p-2 border rounded">
                    {editingModifierId === mod.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editModifierName}
                          onChange={(e) => setEditModifierName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEditModifier(); }}
                          className="flex-1 h-8 px-2 border rounded text-sm"
                          autoFocus
                        />
                        <Button size="sm" onClick={saveEditModifier}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingModifierId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-muted-foreground mr-2">
                            {index + 1}.
                          </span>
                          <span className="font-medium">{mod.name}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEditModifier(mod)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteModifier(mod.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
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

        {/* ── Import Tab ── */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import from CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload or paste CSV files. Import creates Types, Groups, Modifiers, and Exercises.
                Duplicates (by name) are skipped.
              </p>

              <div>
                <label className="text-sm font-medium">1. Types &amp; Groups CSV</label>
                <p className="text-xs text-muted-foreground mb-1">
                  Columns: Group, Type &mdash; Maps groups to workout types. Multi-type groups use quoted comma-separated values.
                </p>
                <div className="flex gap-2 mb-1">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={(e) => handleFileUpload(e, setTypesCsv)}
                    className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded-md file:border file:text-sm file:cursor-pointer"
                  />
                  {typesCsv && (
                    <span className="text-xs text-green-600 self-center">
                      Loaded ({typesCsv.split("\n").filter((l) => l.trim()).length - 1} rows)
                    </span>
                  )}
                </div>
                <textarea
                  value={typesCsv}
                  onChange={(e) => setTypesCsv(e.target.value)}
                  placeholder={`Group,Type\nMain Squat,Squat Day\nGeneral Accessories,"Squat Day, Bench Day, Deadlift Day"`}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-md text-sm font-mono resize-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium">2. Exercises CSV</label>
                <p className="text-xs text-muted-foreground mb-1">
                  Columns: Exercise, Group, Tonnage, Modifiers, Measure &mdash; Groups and modifiers are comma-separated in quotes.
                </p>
                <div className="flex gap-2 mb-1">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={(e) => handleFileUpload(e, setExercisesCsvImport)}
                    className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded-md file:border file:text-sm file:cursor-pointer"
                  />
                  {exercisesCsvImport && (
                    <span className="text-xs text-green-600 self-center">
                      Loaded ({exercisesCsvImport.split("\n").filter((l) => l.trim()).length - 1} rows)
                    </span>
                  )}
                </div>
                <textarea
                  value={exercisesCsvImport}
                  onChange={(e) => setExercisesCsvImport(e.target.value)}
                  placeholder={`Exercise,Group,Tonnage,Modifiers,Measure\nSquats,Main Squat,y,Raised Heel,srw\nX Squats,Secondary Squat,y,"Raised Heel, Banded",srw`}
                  rows={5}
                  className="w-full px-3 py-2 border rounded-md text-sm font-mono resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleImport}
                  disabled={importing || (!typesCsv.trim() && !exercisesCsvImport.trim())}
                >
                  {importing ? "Importing..." : "Import All"}
                </Button>
                {(typesCsv || exercisesCsvImport) && (
                  <Button
                    variant="outline"
                    onClick={() => { setTypesCsv(""); setExercisesCsvImport(""); setImportResult(null); }}
                  >
                    Clear
                  </Button>
                )}
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
              <CardTitle className="text-base">Import Cycle Maxes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a CSV with columns: <code>Lift, Weight, Date</code> (date as M/D/YYYY).
                Matches lift names to exercises (case-insensitive) and marks matching sets as cycle max.
              </p>

              <div className="flex gap-2 mb-1">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => handleFileUpload(e, setCycleMaxCsv)}
                  className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded-md file:border file:text-sm file:cursor-pointer"
                />
                {cycleMaxCsv && (
                  <span className="text-xs text-green-600 self-center">
                    Loaded ({cycleMaxCsv.split("\n").filter((l) => l.trim()).length - 1} rows)
                  </span>
                )}
              </div>
              <textarea
                value={cycleMaxCsv}
                onChange={(e) => setCycleMaxCsv(e.target.value)}
                placeholder={`Lift,Weight,Date\nBench Press,315,6/15/2024\nSquats,405,7/1/2024`}
                rows={4}
                className="w-full px-3 py-2 border rounded-md text-sm font-mono resize-none"
              />

              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (!cycleMaxCsv.trim()) return;
                    setCycleMaxImporting(true);
                    setCycleMaxResult(null);
                    try {
                      const headers = await getAuthHeaders();
                      const res = await fetch("/api/workouts/import/cycle-max", {
                        method: "POST",
                        headers: { ...headers, "Content-Type": "application/json" },
                        body: JSON.stringify({ csv: cycleMaxCsv }),
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error || "Import failed");

                      const s = json.summary;
                      const lines = [
                        `Parsed: ${s.totalRows} rows (${s.parseErrors} parse errors)`,
                        `Exercises matched: ${s.exercisesMatched}`,
                        `Sets updated: ${s.setsUpdated}`,
                        `Sets not found: ${s.setsNotFound}`,
                      ];
                      if (s.unmatchedExercises.length > 0) {
                        lines.push("", "Unmatched exercises:", ...s.unmatchedExercises.map((n: string) => `  - ${n}`));
                      }
                      if (json.notFoundDetails?.length > 0) {
                        lines.push("", "Not found details (first 50):", ...json.notFoundDetails.map((d: string) => `  - ${d}`));
                      }
                      if (json.parseErrors?.length > 0) {
                        lines.push("", "Parse errors:", ...json.parseErrors.map((e: string) => `  - ${e}`));
                      }
                      setCycleMaxResult(lines.join("\n"));
                    } catch (e) {
                      setCycleMaxResult(`Error: ${e instanceof Error ? e.message : "Import failed"}`);
                    } finally {
                      setCycleMaxImporting(false);
                    }
                  }}
                  disabled={cycleMaxImporting || !cycleMaxCsv.trim()}
                >
                  {cycleMaxImporting ? "Importing..." : "Import Cycle Maxes"}
                </Button>
                {cycleMaxCsv && (
                  <Button
                    variant="outline"
                    onClick={() => { setCycleMaxCsv(""); setCycleMaxResult(null); }}
                  >
                    Clear
                  </Button>
                )}
              </div>

              {cycleMaxResult && (
                <pre className="text-sm p-3 bg-muted rounded-md whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {cycleMaxResult}
                </pre>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">CSV Format Reference</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <div>
                <p className="font-medium text-foreground">Types &amp; Groups CSV</p>
                <p>Two columns: <code>Group</code> and <code>Type</code>. Each row maps a group to one or more types.</p>
                <p>For groups in multiple types, quote the Type field: <code>&quot;Squat Day, Bench Day&quot;</code></p>
              </div>
              <div>
                <p className="font-medium text-foreground">Exercises CSV</p>
                <p><strong>Exercise:</strong> The exercise name</p>
                <p><strong>Group:</strong> Comma-separated group names (quoted if multiple)</p>
                <p><strong>Tonnage:</strong> <code>y</code> or <code>n</code> &mdash; whether it counts toward volume</p>
                <p><strong>Modifiers:</strong> Comma-separated modifier names (quoted if multiple)</p>
                <p><strong>Measure:</strong> <code>srw</code> (sets/reps/weight), <code>coo</code> (cycles/on/off), <code>mmiw</code> (min/miles/incline/weight), <code>mmw</code> (min/miles/weight), <code>mw</code> (min/weight), <code>minutes</code></p>
              </div>
              <div>
                <p className="font-medium text-foreground">Modifiers are auto-extracted</p>
                <p>Modifiers listed in the Exercises CSV are automatically created. No separate modifier import needed.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
