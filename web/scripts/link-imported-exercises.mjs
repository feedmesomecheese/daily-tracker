/**
 * One-off migration script to link imported standalone exercises to their
 * X-prefixed parent exercises + modifier IDs.
 *
 * Background: The import script created standalone exercise records for names
 * like "Raised Heel Squats" without parent_exercise_id. Live data uses
 * exercise_id = "X Squats" + modifier_ids = [raised_heel_id]. This script
 * detects the pattern and links them so stats show continuous history.
 *
 * Usage (dry-run, shows what would change):
 *   node scripts/link-imported-exercises.mjs
 *
 * Usage (apply changes):
 *   node scripts/link-imported-exercises.mjs --apply
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const apply = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function main() {
  // ── Load owner ──
  const { data: usersData } = await supabase.auth.admin.listUsers();
  const owner = usersData?.users?.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0];
  if (!owner) throw new Error("No users found");
  const ownerId = owner.id;
  console.log(`Owner: ${owner.email} (${ownerId})`);

  // ── Load modifiers ──
  const { data: modifiers, error: modErr } = await supabase
    .from("exercise_modifiers")
    .select("id, name")
    .eq("owner_id", ownerId);
  if (modErr) throw new Error(`Failed to load modifiers: ${modErr.message}`);

  console.log(`\nLoaded ${modifiers.length} modifiers:`);
  for (const m of modifiers) console.log(`  "${m.name}" (${m.id})`);

  // Sort modifiers longest-first so multi-word modifiers match before substrings
  const sortedModifiers = [...modifiers].sort((a, b) => b.name.length - a.name.length);

  // ── Load all exercises ──
  const { data: exercises, error: exErr } = await supabase
    .from("exercises")
    .select("id, name, parent_exercise_id")
    .eq("owner_id", ownerId);
  if (exErr) throw new Error(`Failed to load exercises: ${exErr.message}`);

  console.log(`\nLoaded ${exercises.length} exercises`);

  // Build map: base name (lowercase) → exercise id, for X-prefixed exercises
  // e.g. "squats" → id of "X Squats"
  const xExerciseByBase = new Map();
  for (const ex of exercises) {
    if (ex.name.startsWith("X ")) {
      xExerciseByBase.set(ex.name.slice(2).toLowerCase(), ex.id);
    }
  }
  console.log(`X-prefixed exercises: ${xExerciseByBase.size}`);
  for (const [base, id] of xExerciseByBase) {
    console.log(`  "X ${base}" → ${id}`);
  }

  // ── Try to match orphaned exercises ──
  // Orphaned = no parent_exercise_id, name does NOT start with "X "
  const orphaned = exercises.filter(
    (ex) => !ex.parent_exercise_id && !ex.name.startsWith("X ")
  );
  console.log(`\nOrphaned exercises to check: ${orphaned.length}`);

  /**
   * Greedy recursive matcher.
   * Tries to strip known modifier names from the front of the remaining name,
   * then checks if the remainder matches an X-exercise base name.
   */
  function tryMatch(remaining, collectedModIds) {
    // Check if remaining matches an X-exercise base
    const xId = xExerciseByBase.get(remaining.toLowerCase());
    if (xId) {
      return { parentId: xId, modifierIds: collectedModIds };
    }

    // Try stripping each modifier from the front
    for (const mod of sortedModifiers) {
      const prefix = mod.name + " ";
      if (remaining.startsWith(prefix)) {
        const rest = remaining.slice(prefix.length);
        const result = tryMatch(rest, [...collectedModIds, mod.id]);
        if (result) return result;
      }
    }

    return null;
  }

  const matches = [];
  const unmatched = [];

  for (const ex of orphaned) {
    const result = tryMatch(ex.name, []);
    if (result) {
      matches.push({ exercise: ex, ...result });
    } else {
      unmatched.push(ex);
    }
  }

  console.log(`\n✓ Matched ${matches.length} exercises:`);
  for (const m of matches) {
    const parentName = exercises.find((e) => e.id === m.parentId)?.name;
    const modNames = m.modifierIds.map(
      (id) => modifiers.find((mod) => mod.id === id)?.name ?? id
    );
    console.log(
      `  "${m.exercise.name}" → parent="${parentName}", modifiers=[${modNames.join(", ")}]`
    );
  }

  if (unmatched.length > 0) {
    console.log(`\n✗ Could not match ${unmatched.length} exercises (no changes needed):`);
    for (const ex of unmatched) {
      console.log(`  "${ex.name}"`);
    }
  }

  if (matches.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  if (!apply) {
    console.log(
      `\nDry run complete. Run with --apply to commit ${matches.length} changes.`
    );
    return;
  }

  // ── Apply changes ──
  console.log(`\nApplying ${matches.length} updates...`);
  let successCount = 0;
  let errorCount = 0;

  for (const m of matches) {
    const { error } = await supabase
      .from("exercises")
      .update({
        parent_exercise_id: m.parentId,
        parent_modifier_filter: m.modifierIds,
      })
      .eq("id", m.exercise.id)
      .eq("owner_id", ownerId);

    if (error) {
      console.error(`  ✗ "${m.exercise.name}": ${error.message}`);
      errorCount++;
    } else {
      console.log(`  ✓ "${m.exercise.name}"`);
      successCount++;
    }
  }

  console.log(`\nDone: ${successCount} updated, ${errorCount} errors`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
