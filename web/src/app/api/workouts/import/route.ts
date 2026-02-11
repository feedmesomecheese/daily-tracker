import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type ImportModifier = {
  name: string;
  adjective_order?: number;
};

type ImportCategory = {
  name: string;
  short_code?: string;
  color?: string;
};

type ImportExercise = {
  name: string;
  exercise_type?: string;
  counts_toward_volume?: boolean;
  category_names?: string[];  // Will be resolved to IDs
  modifier_names?: string[];  // Will be resolved to IDs
  aliases?: string[];
};

type ImportData = {
  modifiers?: ImportModifier[];
  categories?: ImportCategory[];
  exercises?: ImportExercise[];
};

// POST /api/workouts/import - Import modifiers, categories, and exercises
export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body: ImportData = await req.json();
  const { modifiers = [], categories = [], exercises = [] } = body;

  const results = {
    modifiers: { imported: 0, errors: [] as string[] },
    categories: { imported: 0, errors: [] as string[] },
    exercises: { imported: 0, errors: [] as string[] },
  };

  // 1. Import modifiers first
  const modifierNameToId = new Map<string, string>();

  if (modifiers.length > 0) {
    // Get existing modifiers to avoid duplicates
    const { data: existingModifiers } = await supabase
      .from("exercise_modifiers")
      .select("id, name")
      .eq("owner_id", user.id);

    for (const existing of existingModifiers || []) {
      modifierNameToId.set(existing.name.toLowerCase(), existing.id);
    }

    // Get max order
    const { data: maxOrderData } = await supabase
      .from("exercise_modifiers")
      .select("adjective_order")
      .eq("owner_id", user.id)
      .order("adjective_order", { ascending: false })
      .limit(1);
    let nextOrder = (maxOrderData?.[0]?.adjective_order ?? -1) + 1;

    for (const mod of modifiers) {
      const nameLower = mod.name.toLowerCase();
      if (modifierNameToId.has(nameLower)) {
        // Already exists, skip
        continue;
      }

      const { data, error } = await supabase
        .from("exercise_modifiers")
        .insert({
          owner_id: user.id,
          name: mod.name.trim(),
          adjective_order: mod.adjective_order ?? nextOrder++,
        })
        .select("id")
        .single();

      if (error) {
        results.modifiers.errors.push(`${mod.name}: ${error.message}`);
      } else {
        results.modifiers.imported++;
        modifierNameToId.set(nameLower, data.id);
      }
    }
  }

  // 2. Import categories
  const categoryNameToId = new Map<string, string>();

  if (categories.length > 0) {
    // Get existing categories
    const { data: existingCategories } = await supabase
      .from("exercise_categories")
      .select("id, name")
      .eq("owner_id", user.id);

    for (const existing of existingCategories || []) {
      categoryNameToId.set(existing.name.toLowerCase(), existing.id);
    }

    // Get max sort_order
    const { data: maxSortData } = await supabase
      .from("exercise_categories")
      .select("sort_order")
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    let nextSort = (maxSortData?.[0]?.sort_order ?? -1) + 1;

    for (const cat of categories) {
      const nameLower = cat.name.toLowerCase();
      if (categoryNameToId.has(nameLower)) {
        // Already exists, skip
        continue;
      }

      const { data, error } = await supabase
        .from("exercise_categories")
        .insert({
          owner_id: user.id,
          name: cat.name.trim(),
          short_code: cat.short_code?.trim() || null,
          color: cat.color || null,
          sort_order: nextSort++,
        })
        .select("id")
        .single();

      if (error) {
        results.categories.errors.push(`${cat.name}: ${error.message}`);
      } else {
        results.categories.imported++;
        categoryNameToId.set(nameLower, data.id);
      }
    }
  }

  // 3. Import exercises (resolving category and modifier names to IDs)
  if (exercises.length > 0) {
    // Get existing exercises
    const { data: existingExercises } = await supabase
      .from("exercises")
      .select("id, name")
      .eq("owner_id", user.id);

    const existingNames = new Set(
      (existingExercises || []).map((e: { name: string }) => e.name.toLowerCase())
    );

    // Get max sort_order
    const { data: maxSortData } = await supabase
      .from("exercises")
      .select("sort_order")
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    let nextSort = (maxSortData?.[0]?.sort_order ?? -1) + 1;

    for (const ex of exercises) {
      const nameLower = ex.name.toLowerCase();
      if (existingNames.has(nameLower)) {
        // Already exists, skip
        continue;
      }

      // Resolve category names to IDs
      const categoryIds: string[] = [];
      for (const catName of ex.category_names || []) {
        const catId = categoryNameToId.get(catName.toLowerCase());
        if (catId) {
          categoryIds.push(catId);
        }
      }

      // Resolve modifier names to IDs
      const modifierIds: string[] = [];
      for (const modName of ex.modifier_names || []) {
        const modId = modifierNameToId.get(modName.toLowerCase());
        if (modId) {
          modifierIds.push(modId);
        }
      }

      const { error } = await supabase.from("exercises").insert({
        owner_id: user.id,
        name: ex.name.trim(),
        exercise_type: ex.exercise_type || "weighted",
        counts_toward_volume: ex.counts_toward_volume ?? true,
        category_ids: categoryIds,
        available_modifier_ids: modifierIds,
        aliases: ex.aliases || [],
        sort_order: nextSort++,
      });

      if (error) {
        results.exercises.errors.push(`${ex.name}: ${error.message}`);
      } else {
        results.exercises.imported++;
        existingNames.add(nameLower);
      }
    }
  }

  return NextResponse.json({
    message: "Import complete",
    results,
  });
}
