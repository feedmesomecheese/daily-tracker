/**
 * Update existing books from CSV (for reimporting specific columns)
 *
 * Usage:
 *   npx tsx scripts/update-books-from-csv.ts <csv_file> <owner_id> [--columns=source,format]
 *
 * Example:
 *   npx tsx scripts/update-books-from-csv.ts ~/Downloads/books.csv abc123 --columns=source,format
 *
 * This script matches books by Title+Author and updates only the specified columns.
 * If --columns is not provided, it will update: source, format, pages, genre, rating, notes
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";

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

// Column name variations
const columnMappings: Record<string, string[]> = {
  title: ["title", "book", "book title", "name"],
  author: ["author", "author name", "by"],
  pages: ["pages", "page count", "page", "length"],
  genre: ["genre", "category"],
  format: ["format", "book format"],
  source: ["source", "owned", "in library", "from"],
  rating: ["rating", "score", "stars"],
  notes: ["notes", "review", "comments", "thoughts"],
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

function parseFormat(value: string | undefined): "physical" | "ebook" | "audio" | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (v === "a" || v === "audio" || v === "audiobook") return "audio";
  if (v === "e" || v === "ebook" || v === "kindle" || v === "digital") return "ebook";
  if (v === "b" || v === "p" || v === "physical" || v === "book" || v === "paper" || v === "hardcover" || v === "paperback") return "physical";
  return null;
}

function parseSource(value: string | undefined): "owned" | "library" | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (v === "yes" || v === "y" || v === "owned" || v === "own" || v === "1" || v === "true" || v === "o") return "owned";
  if (v === "no" || v === "n" || v === "library" || v === "lib" || v === "0" || v === "false" || v === "l") return "library";
  return null;
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
  const args = process.argv.slice(2);
  const csvFile = args.find((a) => !a.startsWith("--"));
  const ownerId = args.find((a, i) => !a.startsWith("--") && i > 0);
  const columnsArg = args.find((a) => a.startsWith("--columns="));

  if (!csvFile || !ownerId) {
    console.error("Usage: npx tsx scripts/update-books-from-csv.ts <csv_file> <owner_id> [--columns=source,format]");
    process.exit(1);
  }

  const columnsToUpdate = columnsArg
    ? columnsArg.replace("--columns=", "").split(",").map((c) => c.trim().toLowerCase())
    : ["source", "format", "pages", "genre", "rating", "notes"];

  console.log(`Columns to update: ${columnsToUpdate.join(", ")}`);

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

  // Detect columns
  const headers = Object.keys(records[0]);
  console.log("CSV columns:", headers.join(", "));

  const cols: Record<string, string | null> = {};
  for (const [field, variations] of Object.entries(columnMappings)) {
    cols[field] = findColumn(headers, variations);
  }

  if (!cols.title || !cols.author) {
    console.error("Could not find Title and Author columns");
    process.exit(1);
  }

  console.log("\nColumn mapping:");
  for (const col of columnsToUpdate) {
    console.log(`  ${col}: ${cols[col] || "(not found)"}`);
  }

  // Fetch existing books
  const { data: existingBooks, error } = await supabase
    .from("books")
    .select("id, title, author")
    .eq("owner_id", ownerId);

  if (error) {
    console.error("Error fetching books:", error.message);
    process.exit(1);
  }

  console.log(`\nFound ${existingBooks.length} books in database`);

  // Create lookup map
  const bookMap = new Map<string, string>();
  for (const book of existingBooks) {
    const key = `${book.title.toLowerCase().trim()}|||${book.author.toLowerCase().trim()}`;
    bookMap.set(key, book.id);
  }

  // Process CSV records
  let matched = 0;
  let updated = 0;
  const updates: { id: string; data: Record<string, unknown>; title: string }[] = [];

  for (const row of records as Record<string, string>[]) {
    const title = row[cols.title!]?.trim();
    const author = row[cols.author!]?.trim();
    if (!title || !author) continue;

    const key = `${title.toLowerCase()}|||${author.toLowerCase()}`;
    const bookId = bookMap.get(key);

    if (!bookId) continue;
    matched++;

    const updateData: Record<string, unknown> = {};

    for (const col of columnsToUpdate) {
      if (!cols[col]) continue;
      const value = row[cols[col]!];

      switch (col) {
        case "format":
          const fmt = parseFormat(value);
          if (fmt) updateData.format = fmt;
          break;
        case "source":
          const src = parseSource(value);
          if (src) updateData.source = src;
          break;
        case "pages":
          const pages = parseInt2(value);
          if (pages) updateData.pages = pages;
          break;
        case "rating":
          const rating = parseNumber(value);
          if (rating !== null) updateData.rating = rating;
          break;
        case "genre":
          if (value?.trim()) updateData.genre = value.trim();
          break;
        case "notes":
          if (value?.trim()) updateData.notes = value.trim();
          break;
      }
    }

    if (Object.keys(updateData).length > 0) {
      updates.push({ id: bookId, data: updateData, title });
    }
  }

  console.log(`\nMatched ${matched} books`);
  console.log(`Updates to apply: ${updates.length}`);

  if (updates.length === 0) {
    console.log("Nothing to update.");
    process.exit(0);
  }

  // Preview
  console.log("\nPreview (first 10):");
  updates.slice(0, 10).forEach((u) => {
    console.log(`  "${u.title}": ${JSON.stringify(u.data)}`);
  });

  console.log("\nPress Ctrl+C to cancel, or wait 5 seconds to proceed...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Apply updates
  for (const update of updates) {
    const { error } = await supabase
      .from("books")
      .update(update.data)
      .eq("id", update.id);

    if (error) {
      console.error(`Error updating "${update.title}":`, error.message);
    } else {
      updated++;
    }
  }

  console.log(`\nUpdated ${updated}/${updates.length} books`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
