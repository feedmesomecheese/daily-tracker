/**
 * Find and update cover art for books missing covers
 *
 * Usage:
 *   npx tsx scripts/books-find-covers.ts <owner_id> [--all]
 *
 * Options:
 *   --all    Update all books, even those with existing covers
 *
 * Example:
 *   npx tsx scripts/books-find-covers.ts abc123-def456
 *   npx tsx scripts/books-find-covers.ts abc123-def456 --all
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

type OpenLibraryDoc = {
  title: string;
  author_name?: string[];
  cover_i?: number;
  key: string;
};

type OpenLibraryResponse = {
  docs: OpenLibraryDoc[];
  numFound: number;
};

async function searchOpenLibrary(title: string, author: string): Promise<string | null> {
  const query = `${title} ${author}`.trim();
  const encodedQuery = encodeURIComponent(query);
  const url = `https://openlibrary.org/search.json?q=${encodedQuery}&limit=5&fields=title,author_name,cover_i,key`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "DailyTracker/1.0 (Book tracking app)",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data: OpenLibraryResponse = await response.json();

    // Find first result with a cover
    for (const doc of data.docs) {
      if (doc.cover_i) {
        return `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Rate limiting: wait between requests to be nice to Open Library
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const ownerId = args.find((a) => !a.startsWith("--"));
  const updateAll = args.includes("--all");

  if (!ownerId) {
    console.error("Usage: npx tsx scripts/books-find-covers.ts <owner_id> [--all]");
    process.exit(1);
  }

  console.log("Fetching books...");

  let query = supabase
    .from("books")
    .select("id, title, author, cover_url")
    .eq("owner_id", ownerId);

  if (!updateAll) {
    query = query.is("cover_url", null);
  }

  const { data: books, error } = await query;

  if (error) {
    console.error("Error fetching books:", error.message);
    process.exit(1);
  }

  const booksToUpdate = updateAll ? books : books.filter((b) => !b.cover_url);
  console.log(`Found ${booksToUpdate.length} books ${updateAll ? "total" : "without covers"}`);

  if (booksToUpdate.length === 0) {
    console.log("Nothing to update.");
    process.exit(0);
  }

  console.log("\nSearching Open Library for covers...");
  console.log("(This may take a while - being respectful to the API)\n");

  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < booksToUpdate.length; i++) {
    const book = booksToUpdate[i];
    const progress = `[${i + 1}/${booksToUpdate.length}]`;

    process.stdout.write(`${progress} "${book.title}" by ${book.author}... `);

    const coverUrl = await searchOpenLibrary(book.title, book.author);

    if (coverUrl) {
      const { error: updateError } = await supabase
        .from("books")
        .update({ cover_url: coverUrl })
        .eq("id", book.id);

      if (updateError) {
        console.log("ERROR updating");
        errors++;
      } else {
        console.log("FOUND");
        found++;
      }
    } else {
      console.log("not found");
      notFound++;
    }

    // Rate limit: wait 500ms between requests
    if (i < booksToUpdate.length - 1) {
      await sleep(500);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Covers found: ${found}`);
  console.log(`Not found: ${notFound}`);
  if (errors > 0) {
    console.log(`Errors: ${errors}`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
