import { NextResponse } from "next/server";
import { validateAiKey, getAiSupabase, getAiOwnerId, AI_CORS_HEADERS, handleAiOptions } from "@/lib/aiAuth";

export async function OPTIONS() { return handleAiOptions(); }

export async function GET(req: Request) {
  const authError = validateAiKey(req);
  if (authError) return authError;

  try {
  const supabase = getAiSupabase();
  const ownerId = getAiOwnerId();

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // to_read | reading | completed | dnf
  const year = url.searchParams.get("year");     // e.g. "2025" — filters by finished_at year

  // Always fetch all books for accurate counts and stats
  const { data: allBooks, error } = await supabase
    .from("books")
    .select("title, author, pages, genre, format, source, status, priority, added_at, started_at, finished_at, rating, notes, would_reread, reading_number")
    .eq("owner_id", ownerId)
    .order("finished_at", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: AI_CORS_HEADERS });

  const all = allBooks ?? [];

  // Always-accurate counts across the full library
  const counts = {
    total: all.length,
    completed: all.filter((b) => b.status === "completed").length,
    reading: all.filter((b) => b.status === "reading").length,
    to_read: all.filter((b) => b.status === "to_read").length,
    dnf: all.filter((b) => b.status === "dnf").length,
  };

  // Reading stats by year (completed books only)
  const completed = all.filter((b) => b.status === "completed" && b.finished_at);
  const statsByYear: Record<string, { books: number; pages: number; ratings: number[]; genres: Record<string, number> }> = {};

  for (const b of completed) {
    const y = String(b.finished_at).slice(0, 4);
    if (!statsByYear[y]) statsByYear[y] = { books: 0, pages: 0, ratings: [], genres: {} };
    statsByYear[y].books += 1;
    statsByYear[y].pages += b.pages ?? 0;
    if (b.rating != null) statsByYear[y].ratings.push(b.rating);
    if (b.genre) statsByYear[y].genres[b.genre] = (statsByYear[y].genres[b.genre] ?? 0) + 1;
  }

  const yearStats = Object.entries(statsByYear)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([y, s]) => ({
      year: y,
      books_read: s.books,
      pages_read: s.pages,
      avg_rating: s.ratings.length > 0 ? Math.round((s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length) * 10) / 10 : null,
      top_genres: Object.entries(s.genres).sort(([, a], [, b]) => b - a).slice(0, 3).map(([g, n]) => ({ genre: g, count: n })),
    }));

  // Genre breakdown (all completed books)
  const genreMap: Record<string, { count: number; ratings: number[] }> = {};
  for (const b of completed) {
    const g = b.genre ?? "Unknown";
    if (!genreMap[g]) genreMap[g] = { count: 0, ratings: [] };
    genreMap[g].count += 1;
    if (b.rating != null) genreMap[g].ratings.push(b.rating);
  }
  const genreStats = Object.entries(genreMap)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([genre, s]) => ({
      genre,
      count: s.count,
      avg_rating: s.ratings.length > 0 ? Math.round((s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length) * 10) / 10 : null,
    }));

  // Only return books when a filter is applied; cap at limit to stay within response size limits
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(parseInt(limitParam ?? "50", 10) || 50, 200);

  let books: typeof all = [];
  let booksNote: string | undefined;
  if (status || year) {
    let filtered = all;
    if (status) filtered = filtered.filter((b) => b.status === status);
    if (year) filtered = filtered.filter((b) => b.finished_at && String(b.finished_at).startsWith(year));
    const total = filtered.length;
    books = filtered.slice(0, limit);
    if (total > limit) {
      booksNote = `Showing ${limit} of ${total} books (most recent first). Use ?limit= (max 200) or narrow with ?year= to get more.`;
    }
  } else {
    booksNote = "Use ?status= or ?year= to retrieve the books list. Counts and stats above cover all time.";
  }

  return NextResponse.json(
    { counts, year_stats: yearStats, genre_stats: genreStats, books, ...(booksNote ? { note: booksNote } : {}) },
    { headers: AI_CORS_HEADERS }
  );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500, headers: AI_CORS_HEADERS });
  }
}
