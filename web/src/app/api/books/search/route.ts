import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type OpenLibraryDoc = {
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  subject?: string[];
  cover_i?: number;
  key: string;
  edition_key?: string[];
};

type OpenLibraryResponse = {
  docs: OpenLibraryDoc[];
  numFound: number;
};

type OpenLibraryEdition = {
  covers?: number[];
  title?: string;
  publishers?: string[];
  publish_date?: string;
};

export type BookSearchResult = {
  title: string;
  author: string;
  year: number | null;
  pages: number | null;
  genres: string[];
  cover_url: string | null;
  cover_options: string[];
  open_library_key: string;
};

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null };
  }
  return { user };
}

// GET /api/books/search?q=the+hobbit
export async function GET(req: Request) {
  const { user } = await getAuthedClient(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = url.searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }

  try {
    // Search Open Library
    const encodedQuery = encodeURIComponent(query.trim());
    const openLibraryUrl = `https://openlibrary.org/search.json?q=${encodedQuery}&limit=8&fields=title,author_name,first_publish_year,number_of_pages_median,subject,cover_i,key,edition_key`;

    const response = await fetch(openLibraryUrl, {
      headers: {
        "User-Agent": "DailyTracker/1.0 (Book tracking app)",
      },
    });

    if (!response.ok) {
      throw new Error(`Open Library API returned ${response.status}`);
    }

    const data: OpenLibraryResponse = await response.json();

    // For each result, try to get a few edition covers
    const results: BookSearchResult[] = await Promise.all(
      data.docs.map(async (doc) => {
        const coverOptions: string[] = [];

        // Add main cover if available
        if (doc.cover_i) {
          coverOptions.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`);
        }

        // Try to get covers from first few editions (limit to avoid slow responses)
        if (doc.edition_key && doc.edition_key.length > 0) {
          const editionsToCheck = doc.edition_key.slice(0, 5);
          try {
            const editionPromises = editionsToCheck.map(async (edKey) => {
              const edRes = await fetch(
                `https://openlibrary.org/books/${edKey}.json`,
                { headers: { "User-Agent": "DailyTracker/1.0" } }
              );
              if (edRes.ok) {
                const ed: OpenLibraryEdition = await edRes.json();
                return ed.covers?.slice(0, 2) || [];
              }
              return [];
            });
            const editionCovers = await Promise.all(editionPromises);
            for (const covers of editionCovers) {
              for (const coverId of covers) {
                if (coverId > 0) {
                  const url = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
                  if (!coverOptions.includes(url)) {
                    coverOptions.push(url);
                  }
                }
              }
            }
          } catch {
            // Ignore edition fetch errors
          }
        }

        return {
          title: doc.title,
          author: doc.author_name?.[0] || "Unknown Author",
          year: doc.first_publish_year ?? null,
          pages: doc.number_of_pages_median ?? null,
          genres: (doc.subject || []).slice(0, 5),
          cover_url: coverOptions[0] || null,
          cover_options: coverOptions.slice(0, 6), // Limit to 6 options
          open_library_key: doc.key,
        };
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Open Library search error:", error);
    return NextResponse.json(
      { error: "Failed to search Open Library" },
      { status: 500 }
    );
  }
}
