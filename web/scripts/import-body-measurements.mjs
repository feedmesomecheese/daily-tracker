/**
 * Import historical body weight and body fat from a 3-column CSV.
 *
 * CSV format (with or without header row):
 *   Date (M/D/YYYY), Weight (lbs, decimal), Body Fat (%, decimal)
 *
 * Usage:
 *   node scripts/import-body-measurements.mjs path/to/data.csv --dry-run
 *   node scripts/import-body-measurements.mjs path/to/data.csv
 *
 * Existing log entries are never overwritten (skip on conflict).
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "fs";

config({ path: ".env" });

const OWNER_ID = "f4fefe91-cb8d-4ae5-8a67-b59dead2572e";
const WEIGHT_METRIC_ID = "weight";
const BODYFAT_METRIC_ID = "bodyfat";
const CHUNK = 500;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const csvPath = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");

if (!csvPath) {
  console.error("Usage: node scripts/import-body-measurements.mjs <file.csv> [--dry-run]");
  process.exit(1);
}

// M/D/YYYY → YYYY-MM-DD
function parseDate(str) {
  const parts = str.trim().split("/");
  if (parts.length !== 3) throw new Error(`Invalid date format: "${str}"`);
  const [m, d, y] = parts;
  if (y.length !== 4) throw new Error(`Expected 4-digit year in: "${str}"`);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log(`\n── Body Measurements Import ${DRY_RUN ? "(DRY RUN)" : ""} ──\n`);

  // ── Parse CSV ──
  const text = readFileSync(csvPath, "utf-8");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Skip header if the first cell isn't a date
  const firstCell = lines[0]?.split(",")[0]?.trim() ?? "";
  const dataLines = isNaN(Date.parse(firstCell)) && !firstCell.match(/^\d/)
    ? lines.slice(1)
    : lines;

  const parsed = [];
  let parseErrors = 0;

  for (const line of dataLines) {
    // Handle quoted fields and trim whitespace
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 2) continue;

    try {
      const date = parseDate(cols[0]);
      const weight = cols[1] !== "" ? parseFloat(cols[1]) : null;
      const bodyfat = cols[2] !== undefined && cols[2] !== "" ? parseFloat(cols[2]) : null;

      if (weight !== null && !isNaN(weight)) {
        parsed.push({ date, metric_id: WEIGHT_METRIC_ID, value: weight });
      }
      if (bodyfat !== null && !isNaN(bodyfat)) {
        parsed.push({ date, metric_id: BODYFAT_METRIC_ID, value: bodyfat });
      }
    } catch (e) {
      console.warn(`  Skipping malformed line: "${line}" — ${e.message}`);
      parseErrors++;
    }
  }

  const uniqueDates = [...new Set(parsed.map((r) => r.date))].sort();
  const weightRows = parsed.filter((r) => r.metric_id === WEIGHT_METRIC_ID);
  const bodyfatRows = parsed.filter((r) => r.metric_id === BODYFAT_METRIC_ID);

  console.log(`CSV rows read:    ${dataLines.length}`);
  console.log(`Parse errors:     ${parseErrors}`);
  console.log(`Weight entries:   ${weightRows.length}`);
  console.log(`Body fat entries: ${bodyfatRows.length}`);
  console.log(`Date range:       ${uniqueDates[0]} → ${uniqueDates[uniqueDates.length - 1]}`);

  if (DRY_RUN) {
    console.log("\n── DRY RUN — first 10 rows ──");
    for (const row of parsed.slice(0, 10)) {
      console.log(`  ${row.date}  ${row.metric_id.padEnd(8)} = ${row.value}`);
    }
    if (parsed.length > 10) console.log(`  ... and ${parsed.length - 10} more`);
    console.log("\nRun without --dry-run to execute.");
    return;
  }

  // ── Check what already exists ──
  console.log("\nChecking for existing log entries...");
  const alreadyLogged = new Set(); // "date:metric_id"

  for (const metricId of [WEIGHT_METRIC_ID, BODYFAT_METRIC_ID]) {
    let offset = 0;
    while (true) {
      const { data, error } = await sb
        .from("log")
        .select("date")
        .eq("owner_id", OWNER_ID)
        .eq("metric_id", metricId)
        .range(offset, offset + 999);

      if (error) throw new Error(`Pre-flight failed for ${metricId}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const row of data) alreadyLogged.add(`${row.date}:${metricId}`);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  console.log(`Existing entries: ${alreadyLogged.size}`);

  // ── Filter to new rows only ──
  const toInsert = parsed.filter((r) => !alreadyLogged.has(`${r.date}:${r.metric_id}`));
  const skipped = parsed.length - toInsert.length;

  console.log(`To insert:        ${toInsert.length}`);
  console.log(`To skip:          ${skipped} (already logged)`);

  if (toInsert.length === 0) {
    console.log("\nNothing to insert — all entries already exist.");
    return;
  }

  // ── Insert in batches ──
  console.log("");
  const rows = toInsert.map((r) => ({
    owner_id: OWNER_ID,
    date: r.date,
    metric_id: r.metric_id,
    value: r.value,
  }));

  let inserted = 0;
  let errors = 0;

  for (const batch of chunk(rows, CHUNK)) {
    const { error } = await sb.from("log").insert(batch);
    if (error) {
      console.error(`  Batch error: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  Progress: ${inserted}/${toInsert.length}`);
    }
  }

  console.log(`\n\n── Import Complete ──`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped} (already logged)`);
  if (errors > 0) console.log(`  Errors:   ${errors}`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
