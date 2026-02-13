import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

// Proper CSV parser that handles quoted fields with commas
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): Record<string, string>[] {
  // Strip BOM
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_")
  );
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

type ImportPayload = {
  types_csv: string;   // TypeList.csv content (Group,Type)
  exercises_csv: string; // ExerciseList.csv content (Exercise,Group,Tonnage,Modifiers,Measure)
};

// POST /api/workouts/import - Import types, groups, modifiers, and exercises from CSVs
export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body: ImportPayload = await req.json();
  const { types_csv = "", exercises_csv = "" } = body;

  const results = {
    types: { imported: 0, skipped: 0, errors: [] as string[] },
    groups: { imported: 0, skipped: 0, errors: [] as string[] },
    modifiers: { imported: 0, skipped: 0, errors: [] as string[] },
    exercises: { imported: 0, skipped: 0, errors: [] as string[] },
  };

  // ── Phase 1: Parse TypeList CSV → extract Types and Groups ──
  // Format: Group,Type  (where Type can be comma-separated in quotes)
  const typeRows = parseCsv(types_csv);

  // Collect unique type names and group-to-type mappings
  const typeNames = new Set<string>();
  const groupToTypes = new Map<string, Set<string>>();

  for (const row of typeRows) {
    const groupName = row.group || "";
    const typesField = row.type || "";

    if (!groupName || !typesField) continue;

    // Type field can contain comma-separated types (already parsed from quotes)
    const types = typesField.split(",").map((t) => t.trim()).filter(Boolean);
    for (const t of types) {
      typeNames.add(t);
    }

    if (!groupToTypes.has(groupName)) {
      groupToTypes.set(groupName, new Set());
    }
    for (const t of types) {
      groupToTypes.get(groupName)!.add(t);
    }
  }

  // ── Phase 2: Create workout_types ──
  const typeNameToId = new Map<string, string>();

  // Get existing types
  const { data: existingTypes } = await supabase
    .from("workout_types")
    .select("id, name")
    .eq("owner_id", user.id);

  for (const existing of existingTypes || []) {
    typeNameToId.set(existing.name.toLowerCase(), existing.id);
  }

  let typeSortOrder = 0;
  for (const typeName of typeNames) {
    if (typeNameToId.has(typeName.toLowerCase())) {
      results.types.skipped++;
      continue;
    }

    const { data, error } = await supabase
      .from("workout_types")
      .insert({
        owner_id: user.id,
        name: typeName,
        group_ids: [], // will update after groups are created
        sort_order: typeSortOrder++,
      })
      .select("id")
      .single();

    if (error) {
      results.types.errors.push(`${typeName}: ${error.message}`);
    } else {
      results.types.imported++;
      typeNameToId.set(typeName.toLowerCase(), data.id);
    }
  }

  // ── Phase 3: Create exercise_groups ──
  const groupNameToId = new Map<string, string>();

  // Get existing groups
  const { data: existingGroups } = await supabase
    .from("exercise_groups")
    .select("id, name")
    .eq("owner_id", user.id);

  for (const existing of existingGroups || []) {
    groupNameToId.set(existing.name.toLowerCase(), existing.id);
  }

  // Detect input_type from group's associated type names
  function detectInputType(groupName: string): string {
    const types = groupToTypes.get(groupName);
    if (!types) return "strength";
    for (const typeName of types) {
      const tl = typeName.toLowerCase();
      if (tl.includes("cardio")) return "cardio";
      if (tl.includes("other exercise")) return "sport";
    }
    // Also check group name directly
    const gl = groupName.toLowerCase();
    if (gl.includes("hiit")) return "hiit";
    if (gl.includes("zone 2") || gl.includes("cardio")) return "cardio";
    if (gl.includes("sport")) return "sport";
    return "strength";
  }

  let groupSortOrder = 0;
  for (const groupName of groupToTypes.keys()) {
    if (groupNameToId.has(groupName.toLowerCase())) {
      results.groups.skipped++;
      continue;
    }

    const { data, error } = await supabase
      .from("exercise_groups")
      .insert({
        owner_id: user.id,
        name: groupName,
        input_type: detectInputType(groupName),
        sort_order: groupSortOrder++,
      })
      .select("id")
      .single();

    if (error) {
      results.groups.errors.push(`${groupName}: ${error.message}`);
    } else {
      results.groups.imported++;
      groupNameToId.set(groupName.toLowerCase(), data.id);
    }
  }

  // ── Phase 4: Update workout_types with group_ids ──
  // For each type, collect the group IDs that belong to it
  const typeToGroupIds = new Map<string, string[]>();
  for (const [groupName, types] of groupToTypes) {
    const groupId = groupNameToId.get(groupName.toLowerCase());
    if (!groupId) continue;

    for (const typeName of types) {
      if (!typeToGroupIds.has(typeName.toLowerCase())) {
        typeToGroupIds.set(typeName.toLowerCase(), []);
      }
      typeToGroupIds.get(typeName.toLowerCase())!.push(groupId);
    }
  }

  for (const [typeNameLower, groupIds] of typeToGroupIds) {
    const typeId = typeNameToId.get(typeNameLower);
    if (!typeId) continue;

    await supabase
      .from("workout_types")
      .update({ group_ids: groupIds, updated_at: new Date().toISOString() })
      .eq("id", typeId)
      .eq("owner_id", user.id);
  }

  // ── Phase 5: Parse ExerciseList CSV → extract modifiers and exercises ──
  // Format: Exercise,Group,Tonnage,Modifiers,Measure
  const exerciseRows = parseCsv(exercises_csv);

  // First pass: collect all unique modifier names (preserving order from CSV)
  const allModifierNames: string[] = [];
  const seenModifiers = new Set<string>();

  for (const row of exerciseRows) {
    const modsField = row.modifiers || "";
    if (!modsField) continue;
    const mods = modsField.split(",").map((m) => m.trim()).filter(Boolean);
    for (const mod of mods) {
      if (!seenModifiers.has(mod.toLowerCase())) {
        seenModifiers.add(mod.toLowerCase());
        allModifierNames.push(mod);
      }
    }
  }

  // ── Phase 6: Create modifiers ──
  const modifierNameToId = new Map<string, string>();

  // Get existing modifiers
  const { data: existingModifiers } = await supabase
    .from("exercise_modifiers")
    .select("id, name")
    .eq("owner_id", user.id);

  for (const existing of existingModifiers || []) {
    modifierNameToId.set(existing.name.toLowerCase(), existing.id);
  }

  // Get max adjective_order
  const { data: maxOrderData } = await supabase
    .from("exercise_modifiers")
    .select("adjective_order")
    .eq("owner_id", user.id)
    .order("adjective_order", { ascending: false })
    .limit(1);
  let nextModOrder = (maxOrderData?.[0]?.adjective_order ?? -1) + 1;

  for (const modName of allModifierNames) {
    if (modifierNameToId.has(modName.toLowerCase())) {
      results.modifiers.skipped++;
      continue;
    }

    const { data, error } = await supabase
      .from("exercise_modifiers")
      .insert({
        owner_id: user.id,
        name: modName,
        adjective_order: nextModOrder++,
      })
      .select("id")
      .single();

    if (error) {
      results.modifiers.errors.push(`${modName}: ${error.message}`);
    } else {
      results.modifiers.imported++;
      modifierNameToId.set(modName.toLowerCase(), data.id);
    }
  }

  // ── Phase 7: Create exercises ──
  // Get existing exercises
  const { data: existingExercises } = await supabase
    .from("exercises")
    .select("id, name")
    .eq("owner_id", user.id);

  const existingExNames = new Set(
    (existingExercises || []).map((e: { name: string }) => e.name.toLowerCase())
  );

  const { data: maxExSortData } = await supabase
    .from("exercises")
    .select("sort_order")
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  let nextExSort = (maxExSortData?.[0]?.sort_order ?? -1) + 1;

  // Map measure_type to exercise_type
  function measureToExerciseType(measure: string): string {
    switch (measure) {
      case "srw": return "weighted";
      case "coo": return "cardio_hiit";
      case "mmiw":
      case "mmw":
      case "mw":
      case "minutes":
        return "cardio_zone2";
      default:
        return "sport";
    }
  }

  for (const row of exerciseRows) {
    const name = row.exercise || "";
    if (!name) continue;

    if (existingExNames.has(name.toLowerCase())) {
      results.exercises.skipped++;
      continue;
    }

    // Parse groups (comma-separated in the Group column)
    const groupNames = (row.group || "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    const groupIds = groupNames
      .map((g) => groupNameToId.get(g.toLowerCase()))
      .filter((id): id is string => !!id);

    // Parse modifiers
    const modNames = (row.modifiers || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    const modIds = modNames
      .map((m) => modifierNameToId.get(m.toLowerCase()))
      .filter((id): id is string => !!id);

    // Tonnage → counts_toward_volume
    const tonnage = (row.tonnage || "").toLowerCase();
    const countsTowardVolume = tonnage === "y";

    // Measure type
    const measureType = (row.measure || "srw").toLowerCase();
    const exerciseType = measureToExerciseType(measureType);

    const { error } = await supabase.from("exercises").insert({
      owner_id: user.id,
      name,
      exercise_type: exerciseType,
      measure_type: measureType || "srw",
      counts_toward_volume: countsTowardVolume,
      group_ids: groupIds,
      available_modifier_ids: modIds,
      aliases: [],
      sort_order: nextExSort++,
    });

    if (error) {
      results.exercises.errors.push(`${name}: ${error.message}`);
    } else {
      results.exercises.imported++;
      existingExNames.add(name.toLowerCase());
    }
  }

  return NextResponse.json({
    message: "Import complete",
    results,
  });
}
