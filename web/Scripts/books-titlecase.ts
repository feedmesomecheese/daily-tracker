/**
 * Convert book titles and authors to title case
 *
 * Usage:
 *   npx tsx scripts/books-titlecase.ts <owner_id>
 *
 * Example:
 *   npx tsx scripts/books-titlecase.ts abc123-def456-...
 */

import { createClient } from "@supabase/supabase-js";
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

// Words that should remain lowercase (unless first word)
const lowercaseWords = new Set([
  "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
  "at", "by", "in", "of", "on", "to", "up", "as", "is", "if",
  "vs", "vs.", "via", "from", "into", "onto", "with"
]);

// Words/patterns that should stay uppercase
const uppercasePatterns = [
  /^[A-Z]{2,}$/, // Acronyms like "USA", "FBI"
  /^[A-Z]\.[A-Z]\./, // Initials like "J.R.R."
  /^mc[a-z]/i, // McDonald, McCartney
  /^o'[a-z]/i, // O'Brien, O'Connor
];

function toTitleCase(str: string): string {
  if (!str) return str;

  // Split on spaces while preserving multiple spaces
  const words = str.split(/(\s+)/);

  return words.map((word, index) => {
    // Preserve whitespace
    if (/^\s+$/.test(word)) return word;

    // Check if word should stay uppercase
    for (const pattern of uppercasePatterns) {
      if (pattern.test(word)) return word;
    }

    // Get the actual word position (ignoring whitespace)
    const isFirstWord = words.slice(0, index).filter(w => !/^\s+$/.test(w)).length === 0;

    // Check for lowercase words (unless first word)
    const lowerWord = word.toLowerCase();
    if (!isFirstWord && lowercaseWords.has(lowerWord)) {
      return lowerWord;
    }

    // Handle hyphenated words
    if (word.includes("-")) {
      return word.split("-").map((part, i) => {
        if (i === 0 || !lowercaseWords.has(part.toLowerCase())) {
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }
        return part.toLowerCase();
      }).join("-");
    }

    // Handle words with apostrophes (like "don't" or "O'Brien")
    if (word.includes("'")) {
      const parts = word.split("'");
      if (parts[0].toLowerCase() === "o" && parts[1]) {
        // O'Brien -> O'Brien
        return "O'" + parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
      }
      return parts.map((part, i) => {
        if (i === 0) {
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }
        return part.toLowerCase();
      }).join("'");
    }

    // Handle Mc names
    if (word.toLowerCase().startsWith("mc") && word.length > 2) {
      return "Mc" + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
    }

    // Standard title case
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join("");
}

async function main() {
  const [, , ownerId] = process.argv;

  if (!ownerId) {
    console.error("Usage: npx tsx scripts/books-titlecase.ts <owner_id>");
    process.exit(1);
  }

  console.log("Fetching books...");

  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, author")
    .eq("owner_id", ownerId);

  if (error) {
    console.error("Error fetching books:", error.message);
    process.exit(1);
  }

  console.log(`Found ${books.length} books`);

  const updates: { id: string; oldTitle: string; newTitle: string; oldAuthor: string; newAuthor: string }[] = [];

  for (const book of books) {
    const newTitle = toTitleCase(book.title);
    const newAuthor = toTitleCase(book.author);

    if (newTitle !== book.title || newAuthor !== book.author) {
      updates.push({
        id: book.id,
        oldTitle: book.title,
        newTitle,
        oldAuthor: book.author,
        newAuthor,
      });
    }
  }

  console.log(`\nBooks needing updates: ${updates.length}`);

  if (updates.length === 0) {
    console.log("All books are already in title case.");
    process.exit(0);
  }

  // Preview changes
  console.log("\nPreview (first 20 changes):");
  updates.slice(0, 20).forEach((u) => {
    if (u.oldTitle !== u.newTitle) {
      console.log(`  Title: "${u.oldTitle}" -> "${u.newTitle}"`);
    }
    if (u.oldAuthor !== u.newAuthor) {
      console.log(`  Author: "${u.oldAuthor}" -> "${u.newAuthor}"`);
    }
    console.log("");
  });

  if (updates.length > 20) {
    console.log(`  ... and ${updates.length - 20} more`);
  }

  console.log("\nPress Ctrl+C to cancel, or wait 5 seconds to proceed...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Apply updates
  let updated = 0;
  for (const update of updates) {
    const { error } = await supabase
      .from("books")
      .update({
        title: update.newTitle,
        author: update.newAuthor,
      })
      .eq("id", update.id);

    if (error) {
      console.error(`Error updating "${update.oldTitle}":`, error.message);
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
