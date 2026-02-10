/**
 * Fill missing dates with 0 for a specific metric.
 *
 * Usage:
 *   npx ts-node scripts/fill-nulls.ts <metric_id> <owner_id>
 *
 * Example:
 *   npx ts-node scripts/fill-nulls.ts exercise_minutes abc123-def456-...
 *
 * This script:
 * 1. Finds the first logged date for the metric
 * 2. Generates all dates from that date to today
 * 3. Inserts 0 for any missing dates
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

// Load .env from web directory (ES module compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function main() {
  const [, , metricId, ownerId] = process.argv;

  if (!metricId || !ownerId) {
    console.error("Usage: npx ts-node scripts/fill-nulls.ts <metric_id> <owner_id>");
    console.error("\nTo find your owner_id, check your Supabase auth.users table or");
    console.error("look at the network requests in the browser dev tools.");
    process.exit(1);
  }

  console.log(`Filling nulls for metric: ${metricId}`);
  console.log(`Owner ID: ${ownerId}`);

  // 1. Get all existing logs for this metric
  const { data: logs, error: logError } = await supabase
    .from("log")
    .select("date")
    .eq("owner_id", ownerId)
    .eq("metric_id", metricId)
    .order("date", { ascending: true });

  if (logError) {
    console.error("Error fetching logs:", logError.message);
    process.exit(1);
  }

  if (!logs || logs.length === 0) {
    console.log("No existing logs found for this metric. Nothing to backfill.");
    process.exit(0);
  }

  const existingDates = new Set(logs.map((l) => l.date));
  const firstDate = logs[0].date;
  const today = getLocalDateString();

  console.log(`First logged date: ${firstDate}`);
  console.log(`Today: ${today}`);
  console.log(`Existing log count: ${existingDates.size}`);

  // 2. Generate all dates in range
  const allDates = generateDateRange(firstDate, today);
  console.log(`Total dates in range: ${allDates.length}`);

  // 3. Find missing dates
  const missingDates = allDates.filter((d) => !existingDates.has(d));
  console.log(`Missing dates to fill: ${missingDates.length}`);

  if (missingDates.length === 0) {
    console.log("No missing dates. All done!");
    process.exit(0);
  }

  // 4. Preview first 10 missing dates
  console.log("\nFirst 10 missing dates:");
  missingDates.slice(0, 10).forEach((d) => console.log(`  ${d}`));
  if (missingDates.length > 10) {
    console.log(`  ... and ${missingDates.length - 10} more`);
  }

  // 5. Confirm before inserting
  console.log("\nPress Ctrl+C to cancel, or wait 5 seconds to proceed...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // 6. Insert missing dates with value 0
  const rowsToInsert = missingDates.map((date) => ({
    owner_id: ownerId,
    metric_id: metricId,
    date,
    value: 0,
  }));

  // Insert in batches of 500
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < rowsToInsert.length; i += batchSize) {
    const batch = rowsToInsert.slice(i, i + batchSize);
    const { error: insertError } = await supabase.from("log").insert(batch);

    if (insertError) {
      console.error(`Error inserting batch at ${i}:`, insertError.message);
      process.exit(1);
    }

    inserted += batch.length;
    console.log(`Inserted ${inserted}/${rowsToInsert.length}`);
  }

  console.log("\nDone! All missing dates filled with 0.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
