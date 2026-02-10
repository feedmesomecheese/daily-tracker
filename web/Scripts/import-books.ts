/**
 * Import books from CSV (exported from Google Sheets)
 *
 * Usage:
 *   npx tsx scripts/import-books.ts <csv_file> <owner_id>
 *
 * Example:
 *   npx tsx scripts/import-books.ts ~/Downloads/books.csv abc123-def456-...
 *
 * Expected CSV columns (case-insensitive, flexible):
 *   Title, Author, Pages, Genre, Format, Priority, Added, Start, Finish,
 *   DNF, Rating, Review/Notes, Reread, Owned/Source
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";

// Load .env from web directory
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

// Column name variations to check
const columnMappings: Record<string, string[]> = {
  title: ["title", "book", "book title", "name"],
  author: ["author", "author name", "by"],
  pages: ["pages", "page count", "page", "length"],
  genre: ["genre", "category", "type"],
  format: ["format", "book format", "type"],
  priority: ["priority", "pri", "p"],
  added_at: ["added", "added at", "date added", "added date"],
  started_at: ["start", "started", "start date", "started at", "date started"],
  finished_at: ["finish", "finished", "finish date", "finished at", "date finished", "completed", "date completed"],
  dnf: ["dnf", "did not finish", "abandoned"],
  rating: ["rating", "score", "stars", "rate"],
  notes: ["notes", "review", "comments", "thoughts"],
  would_reread: ["reread", "would reread", "re-read", "want to reread"],
  source: ["source", "owned", "in library", "from", "acquired"],
  cover_url: ["cover", "cover url", "cover_url", "image"],
};

function findColumn(headers: string[], variations: string[]): string | null {
  const headerLower = headers.map((h) => h.toLowerCase().trim());
  for (const variation of variations) {
    const idx = headerLower.indexOf(variation.toLowerCase());
    if (idx !== -1) {
      return headers[idx];
    }
  }
  return null;
}

function parseDate(value: string | undefined): string | null {
  if (!value || value.trim() === "") return null;

  const trimmed = value.trim();

  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Try MM/DD/YYYY or M/D/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Try DD/MM/YYYY
  const euMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Try parsing as Date
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function parseFormat(value: string | undefined): "physical" | "ebook" | "audio" | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (v === "a" || v === "audio" || v === "audiobook") return "audio";
  if (v === "e" || v === "ebook" || v === "kindle" || v === "digital") return "ebook";
  if (v === "b" || v === "p" || v === "physical" || v === "book" || v === "paper" || v === "hardcover" || v === "paperback") return "physical";
  return null;
}

function parseSource(value: string | undefined): "owned" | "library" | "kindle_unlimited" | "audible" | "borrowed" | "other" | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (v === "yes" || v === "y" || v === "owned" || v === "own" || v === "1" || v === "true") return "owned";
  if (v === "library" || v === "lib") return "library";
  if (v === "ku" || v === "kindle unlimited" || v === "kindle_unlimited") return "kindle_unlimited";
  if (v === "audible") return "audible";
  if (v === "borrowed" || v === "borrow") return "borrowed";
  if (v === "no" || v === "n" || v === "0" || v === "false") return "library"; // Assume not owned = library
  if (v !== "") return "other";
  return null;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  return v === "yes" || v === "y" || v === "true" || v === "1" || v === "x";
}

function parseNumber(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = parseFloat(value.trim());
  return isNaN(parsed) ? null : parsed;
}

function parseInt2(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = parseInt(value.trim(), 10);
  return isNaN(parsed) ? null : parsed;
}

async function main() {
  const [, , csvFile, ownerId] = process.argv;

  if (!csvFile || !ownerId) {
    console.error("Usage: npx tsx scripts/import-books.ts <csv_file> <owner_id>");
    console.error("\nTo find your owner_id, check your Supabase auth.users table");
    process.exit(1);
  }

  const csvPath = path.resolve(csvFile);
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading CSV: ${csvPath}`);
  const csvContent = fs.readFileSync(csvPath, "utf-8");

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    console.error("No records found in CSV");
    process.exit(1);
  }

  console.log(`Found ${records.length} records`);

  // Detect column mapping
  const firstRecord = records[0] as Record<string, unknown>;
  const headers = Object.keys(firstRecord);
  console.log("\nDetected columns:", headers.join(", "));

  const cols: Record<string, string | null> = {};
  for (const [field, variations] of Object.entries(columnMappings)) {
    cols[field] = findColumn(headers, variations);
  }

  console.log("\nColumn mapping:");
  for (const [field, col] of Object.entries(cols)) {
    console.log(`  ${field}: ${col || "(not found)"}`);
  }

  if (!cols.title || !cols.author) {
    console.error("\nError: Could not find required Title and Author columns");
    process.exit(1);
  }

  // Track title+author combos for re-read detection
  const bookCounts = new Map<string, number>();

  // Transform records
  const books = records.map((row: Record<string, string>) => {
    const title = row[cols.title!]?.trim() || "";
    const author = row[cols.author!]?.trim() || "";

    if (!title || !author) {
      return null;
    }

    // Re-read tracking
    const key = `${title.toLowerCase()}|||${author.toLowerCase()}`;
    const readingNumber = (bookCounts.get(key) || 0) + 1;
    bookCounts.set(key, readingNumber);

    // Determine status
    const isDnf = cols.dnf ? parseBoolean(row[cols.dnf]) : false;
    const finishedAt = cols.finished_at ? parseDate(row[cols.finished_at]) : null;
    const startedAt = cols.started_at ? parseDate(row[cols.started_at]) : null;

    let status: "to_read" | "reading" | "completed" | "dnf" = "to_read";
    if (isDnf) {
      status = "dnf";
    } else if (finishedAt) {
      status = "completed";
    } else if (startedAt) {
      status = "reading";
    }

    return {
      owner_id: ownerId,
      title,
      author,
      pages: cols.pages ? parseInt2(row[cols.pages]) : null,
      genre: cols.genre ? row[cols.genre]?.trim() || null : null,
      cover_url: cols.cover_url ? row[cols.cover_url]?.trim() || null : null,
      format: cols.format ? parseFormat(row[cols.format]) : null,
      source: cols.source ? parseSource(row[cols.source]) : null,
      status,
      priority: cols.priority ? parseInt2(row[cols.priority]) : null,
      added_at: cols.added_at ? parseDate(row[cols.added_at]) : null,
      started_at: startedAt,
      finished_at: finishedAt,
      rating: cols.rating ? parseNumber(row[cols.rating]) : null,
      notes: cols.notes ? row[cols.notes]?.trim() || null : null,
      would_reread: cols.would_reread ? parseBoolean(row[cols.would_reread]) : false,
      reading_number: readingNumber,
    };
  }).filter((b): b is NonNullable<typeof b> => b !== null);

  console.log(`\nValid books to import: ${books.length}`);

  if (books.length === 0) {
    console.log("No valid books to import.");
    process.exit(0);
  }

  // Preview first 5
  console.log("\nPreview (first 5 books):");
  books.slice(0, 5).forEach((b, i) => {
    console.log(`  ${i + 1}. "${b.title}" by ${b.author} [${b.status}]${b.reading_number > 1 ? ` (re-read #${b.reading_number})` : ""}`);
  });

  // Confirm
  console.log("\nPress Ctrl+C to cancel, or wait 5 seconds to proceed...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Insert in batches
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < books.length; i += batchSize) {
    const batch = books.slice(i, i + batchSize);
    const { error } = await supabase.from("books").insert(batch);

    if (error) {
      console.error(`Error inserting batch at ${i}:`, error.message);
      process.exit(1);
    }

    inserted += batch.length;
    console.log(`Inserted ${inserted}/${books.length}`);
  }

  console.log("\nImport complete!");

  // Summary
  const statusCounts = books.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("\nSummary:");
  console.log(`  Total: ${books.length}`);
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  const rereads = books.filter((b) => b.reading_number > 1).length;
  if (rereads > 0) {
    console.log(`  Re-reads: ${rereads}`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
