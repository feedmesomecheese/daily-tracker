import { Resend } from "resend";
import { supabaseAdmin } from "./supabaseAdmin";
import { zipSync, strToU8 } from "fflate";

export type BackupModule = "tracker" | "food" | "workouts" | "labs" | "books";
export const ALL_MODULES: BackupModule[] = ["tracker", "food", "workouts", "labs", "books"];

// ── CSV helpers ───────────────────────────────────────────────────────────────

function escapeCsv(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(row.map(escapeCsv).join(","));
  return lines.join("\n");
}

// ── CSV generators ────────────────────────────────────────────────────────────

async function generateTrackerCsv(ownerId: string): Promise<string> {
  const { data: metrics } = await supabaseAdmin
    .from("metrics")
    .select("id, name, type, group")
    .eq("owner_id", ownerId);

  const metricMap = new Map((metrics ?? []).map((m) => [m.id, m]));

  let allRows: { date: string; metric_id: string; value: number | null; value_text: string | null }[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabaseAdmin
      .from("log")
      .select("date, metric_id, value, value_text")
      .eq("owner_id", ownerId)
      .order("date", { ascending: true })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const rows = allRows.map((r) => {
    const m = metricMap.get(r.metric_id);
    return [r.date, m?.name ?? r.metric_id, m?.group ?? "", m?.type ?? "", r.value, r.value_text];
  });

  return toCsv(["date", "metric_name", "group", "type", "value", "value_text"], rows);
}

async function generateFoodCsv(ownerId: string): Promise<string> {
  const { data: logs } = await supabaseAdmin
    .from("food_logs")
    .select("id, date, is_fasted")
    .eq("owner_id", ownerId)
    .order("date", { ascending: true });

  if (!logs || logs.length === 0) return toCsv(["date", "meal", "item", "qty", "serving", "calories", "protein_g", "fat_g", "carbs_g", "fiber_g"], []);

  const logIds = logs.map((l) => l.id);
  const logDateMap = new Map(logs.map((l) => [l.id, l.date]));

  const rows: unknown[][] = [];

  for (let i = 0; i < logIds.length; i += 200) {
    const chunk = logIds.slice(i, i + 200);
    const { data: meals } = await supabaseAdmin
      .from("food_log_meals")
      .select("id, food_log_id, meal_name")
      .in("food_log_id", chunk)
      .order("meal_order", { ascending: true });

    if (!meals || meals.length === 0) continue;
    const mealIds = meals.map((m) => m.id);
    const mealLogMap = new Map(meals.map((m) => [m.id, { date: logDateMap.get(m.food_log_id) ?? "", meal: m.meal_name }]));

    for (let j = 0; j < mealIds.length; j += 200) {
      const mchunk = mealIds.slice(j, j + 200);
      const { data: items } = await supabaseAdmin
        .from("food_log_items")
        .select("food_log_meal_id, food_name_snapshot, serving_label_snapshot, qty, calories, protein, fat, carbs, fiber")
        .in("food_log_meal_id", mchunk);

      for (const item of items ?? []) {
        const { date, meal } = mealLogMap.get(item.food_log_meal_id) ?? { date: "", meal: "" };
        rows.push([date, meal, item.food_name_snapshot, item.qty, item.serving_label_snapshot,
          item.calories, item.protein, item.fat, item.carbs, item.fiber]);
      }
    }
  }

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv(["date", "meal", "item", "qty", "serving", "calories", "protein_g", "fat_g", "carbs_g", "fiber_g"], rows);
}

async function generateWorkoutsCsv(ownerId: string): Promise<string> {
  const { data: workouts } = await supabaseAdmin
    .from("workouts")
    .select("id, date, workout_type, duration_minutes, rating, notes")
    .eq("owner_id", ownerId)
    .order("date", { ascending: true });

  if (!workouts || workouts.length === 0) return toCsv(["date", "type", "duration_min", "rating", "exercise", "set", "reps", "weight", "notes"], []);

  const workoutIds = workouts.map((w) => w.id);
  const workoutMap = new Map(workouts.map((w) => [w.id, w]));
  const rows: unknown[][] = [];

  for (let i = 0; i < workoutIds.length; i += 200) {
    const chunk = workoutIds.slice(i, i + 200);
    const { data: exercises } = await supabaseAdmin
      .from("workout_exercises")
      .select("id, workout_id, exercise_name")
      .in("workout_id", chunk)
      .order("sort_order", { ascending: true });

    if (!exercises || exercises.length === 0) continue;
    const exIds = exercises.map((e) => e.id);
    const exMap = new Map(exercises.map((e) => [e.id, e]));

    for (let j = 0; j < exIds.length; j += 200) {
      const echunk = exIds.slice(j, j + 200);
      const { data: sets } = await supabaseAdmin
        .from("workout_sets")
        .select("workout_exercise_id, set_number, reps, weight, notes")
        .in("workout_exercise_id", echunk)
        .order("set_number", { ascending: true });

      for (const s of sets ?? []) {
        const ex = exMap.get(s.workout_exercise_id);
        const w = ex ? workoutMap.get(ex.workout_id) : null;
        rows.push([w?.date, w?.workout_type, w?.duration_minutes, w?.rating,
          ex?.exercise_name, s.set_number, s.reps, s.weight, s.notes ?? w?.notes]);
      }
    }
  }

  return toCsv(["date", "type", "duration_min", "rating", "exercise", "set", "reps", "weight", "notes"], rows);
}

async function generateLabsCsv(ownerId: string): Promise<string> {
  const { data: visits } = await supabaseAdmin
    .from("lab_visits")
    .select("id, visit_date, lab_name, provider")
    .eq("owner_id", ownerId)
    .order("visit_date", { ascending: true });

  if (!visits || visits.length === 0) return toCsv(["visit_date", "lab", "provider", "test_name", "canonical_name", "category", "value", "unit", "ref_low", "ref_high", "in_range"], []);

  const visitIds = visits.map((v) => v.id);
  const visitMap = new Map(visits.map((v) => [v.id, v]));
  const rows: unknown[][] = [];

  for (let i = 0; i < visitIds.length; i += 200) {
    const chunk = visitIds.slice(i, i + 200);
    const { data: results } = await supabaseAdmin
      .from("lab_results")
      .select("visit_id, test_name, canonical_name, category, value, unit, ref_low, ref_high, in_range")
      .in("visit_id", chunk);

    for (const r of results ?? []) {
      const v = visitMap.get(r.visit_id);
      rows.push([v?.visit_date, v?.lab_name, v?.provider, r.test_name, r.canonical_name,
        r.category, r.value, r.unit, r.ref_low, r.ref_high, r.in_range]);
    }
  }

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv(["visit_date", "lab", "provider", "test_name", "canonical_name", "category", "value", "unit", "ref_low", "ref_high", "in_range"], rows);
}

async function generateBooksCsv(ownerId: string): Promise<string> {
  const { data: books } = await supabaseAdmin
    .from("books")
    .select("title, author, status, rating, pages, genre, format, source, started_at, finished_at, notes, would_reread")
    .eq("owner_id", ownerId)
    .order("finished_at", { ascending: true });

  const rows = (books ?? []).map((b) => [
    b.title, b.author, b.status, b.rating, b.pages, b.genre, b.format,
    b.source, b.started_at, b.finished_at, b.would_reread, b.notes,
  ]);

  return toCsv(["title", "author", "status", "rating", "pages", "genre", "format", "source", "started_at", "finished_at", "would_reread", "notes"], rows);
}

// ── Main export + email function ──────────────────────────────────────────────

export async function sendBackupEmail(ownerId: string, userEmail: string, modules: BackupModule[]) {
  const date = new Date().toISOString().slice(0, 10);
  const generators: Record<BackupModule, () => Promise<string>> = {
    tracker: () => generateTrackerCsv(ownerId),
    food: () => generateFoodCsv(ownerId),
    workouts: () => generateWorkoutsCsv(ownerId),
    labs: () => generateLabsCsv(ownerId),
    books: () => generateBooksCsv(ownerId),
  };

  const files: Record<string, Uint8Array> = {};
  for (const mod of modules) {
    const csv = await generators[mod]();
    if (csv) files[`${mod}_${date}.csv`] = strToU8(csv);
  }

  if (Object.keys(files).length === 0) return;

  const zipped = zipSync(files);

  const resend = new Resend(process.env.RESEND_API_KEY!);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: userEmail,
    subject: `Daily Tracker Backup — ${date}`,
    html: `
      <p>Your weekly data backup is attached.</p>
      <p><strong>Modules included:</strong> ${modules.join(", ")}</p>
      <p>The ZIP file contains one CSV per module. Import into Excel, Google Sheets, or any data tool.</p>
      <p style="color:#888;font-size:12px">To change backup frequency or modules, visit Settings in your Daily Tracker app.</p>
    `,
    attachments: [{
      filename: `daily_tracker_backup_${date}.zip`,
      content: Buffer.from(zipped).toString("base64"),
    }],
  });
}
