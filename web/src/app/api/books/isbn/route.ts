import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import type { BookSearchResult } from "../search/route";

type OpenLibraryISBN = {
  title: string;
  authors?: { key: string }[];
  number_of_pages?: number;
  covers?: number[];
  subjects?: string[];
  works?: { key: string }[];
  publishers?: string[];
  publish_date?: string;
};

type OpenLibraryAuthor = {
  name: string;
};

type OpenLibraryWork = {
  title?: string;
  subjects?: string[];
  covers?: number[];
  first_publish_date?: string;
};

// GET /api/books/isbn?isbn=9780547928227
export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const isbn = url.searchParams.get("isbn");

  if (!isbn) {
    return NextResponse.json({ error: "ISBN required" }, { status: 400 });
  }

  // Clean ISBN - remove hyphens and spaces
  const cleanIsbn = isbn.replace(/[-\s]/g, "");

  // Validate ISBN format (10 or 13 digits)
  if (!/^\d{10}(\d{3})?$/.test(cleanIsbn)) {
    return NextResponse.json({ error: "Invalid ISBN format" }, { status: 400 });
  }

  try {
    // Fetch book by ISBN from Open Library
    const isbnResponse = await fetch(
      `https://openlibrary.org/isbn/${cleanIsbn}.json`,
      {
        headers: { "User-Agent": "DailyTracker/1.0 (Book tracking app)" },
      }
    );

    if (!isbnResponse.ok) {
      if (isbnResponse.status === 404) {
        return NextResponse.json({ error: "Book not found" }, { status: 404 });
      }
      throw new Error(`Open Library returned ${isbnResponse.status}`);
    }

    const bookData: OpenLibraryISBN = await isbnResponse.json();

    // Fetch author name if available
    let authorName = "Unknown Author";
    if (bookData.authors && bookData.authors.length > 0) {
      try {
        const authorRes = await fetch(
          `https://openlibrary.org${bookData.authors[0].key}.json`,
          { headers: { "User-Agent": "DailyTracker/1.0" } }
        );
        if (authorRes.ok) {
          const authorData: OpenLibraryAuthor = await authorRes.json();
          authorName = authorData.name;
        }
      } catch {
        // Ignore author fetch errors
      }
    }

    // Fetch work data for subjects and first publish date
    let subjects: string[] = [];
    let firstPublishYear: number | null = null;
    let workCovers: number[] = [];

    if (bookData.works && bookData.works.length > 0) {
      try {
        const workRes = await fetch(
          `https://openlibrary.org${bookData.works[0].key}.json`,
          { headers: { "User-Agent": "DailyTracker/1.0" } }
        );
        if (workRes.ok) {
          const workData: OpenLibraryWork = await workRes.json();
          subjects = (workData.subjects || []).slice(0, 5);
          workCovers = workData.covers || [];
          if (workData.first_publish_date) {
            const yearMatch = workData.first_publish_date.match(/\d{4}/);
            if (yearMatch) {
              firstPublishYear = parseInt(yearMatch[0], 10);
            }
          }
        }
      } catch {
        // Ignore work fetch errors
      }
    }

    // Parse year from publish_date if not found in work
    if (!firstPublishYear && bookData.publish_date) {
      const yearMatch = bookData.publish_date.match(/\d{4}/);
      if (yearMatch) {
        firstPublishYear = parseInt(yearMatch[0], 10);
      }
    }

    // Build cover options
    const coverOptions: string[] = [];
    const allCovers = [...(bookData.covers || []), ...workCovers];
    for (const coverId of allCovers) {
      if (coverId > 0) {
        const coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
        if (!coverOptions.includes(coverUrl)) {
          coverOptions.push(coverUrl);
        }
      }
    }

    // Use subjects from book or work
    if (subjects.length === 0 && bookData.subjects) {
      subjects = bookData.subjects.slice(0, 5);
    }

    const result: BookSearchResult = {
      title: bookData.title,
      author: authorName,
      year: firstPublishYear,
      pages: bookData.number_of_pages ?? null,
      genres: subjects,
      cover_url: coverOptions[0] || null,
      cover_options: coverOptions.slice(0, 6),
      open_library_key: bookData.works?.[0]?.key || `/isbn/${cleanIsbn}`,
    };

    return NextResponse.json({ result });
  } catch (error) {
    console.error("ISBN lookup error:", error);
    return NextResponse.json(
      { error: "Failed to lookup ISBN" },
      { status: 500 }
    );
  }
}
