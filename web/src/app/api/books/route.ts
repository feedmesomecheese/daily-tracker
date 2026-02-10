import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Book = {
  id: string;
  title: string;
  author: string;
  pages: number | null;
  genre: string | null;
  cover_url: string | null;
  format: string | null;
  source: string | null;
  status: string;
  priority: number | null;
  added_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  notes: string | null;
  would_reread: boolean;
  reading_number: number;
  sort_order: number | null;
};

const BookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  pages: z.number().int().positive().nullable().optional(),
  genre: z.string().nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  open_library_key: z.string().nullable().optional(),
  format: z.enum(["physical", "ebook", "audio"]).nullable().optional(),
  source: z.enum(["owned", "library"]).nullable().optional(),
  status: z.enum(["to_read", "reading", "completed", "dnf"]).optional().default("to_read"),
  priority: z.number().int().min(1).max(5).nullable().optional(),
  added_at: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  rating: z.number().min(0).max(10).nullable().optional(),
  notes: z.string().nullable().optional(),
  would_reread: z.boolean().optional().default(false),
  reading_number: z.number().int().min(1).optional().default(1),
  sort_order: z.number().int().nullable().optional(),
});

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null };
  }
  return { supabase, user };
}

// GET /api/books - List all books
export async function GET(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const sortBy = url.searchParams.get("sortBy") || "added_at";
  const sortDir = url.searchParams.get("sortDir") || "desc";
  const search = url.searchParams.get("search");
  const format = url.searchParams.get("format");
  const source = url.searchParams.get("source");
  const genre = url.searchParams.get("genre");
  const author = url.searchParams.get("author");
  const rating = url.searchParams.get("rating");
  const finishedYear = url.searchParams.get("finishedYear");
  const finishedMonth = url.searchParams.get("finishedMonth");
  const includeWouldReread = url.searchParams.get("includeWouldReread") === "true";

  let query = supabase
    .from("books")
    .select("*")
    .eq("owner_id", user.id);

  // Status filter with optional would_reread inclusion
  if (status && status !== "all") {
    if (status === "to_read" && includeWouldReread) {
      // Include books marked as would_reread in the to_read filter
      query = query.or(`status.eq.to_read,and(status.eq.completed,would_reread.eq.true)`);
    } else {
      query = query.eq("status", status);
    }
  }

  // Search filter (title or author)
  if (search && search.trim().length > 0) {
    const searchTerm = `%${search.trim()}%`;
    query = query.or(`title.ilike.${searchTerm},author.ilike.${searchTerm}`);
  }

  // Additional filters
  if (format) {
    query = query.eq("format", format);
  }
  if (source) {
    query = query.eq("source", source);
  }
  if (genre) {
    query = query.ilike("genre", `%${genre}%`);
  }
  if (author) {
    query = query.ilike("author", `%${author}%`);
  }
  if (rating) {
    const ratingNum = parseInt(rating);
    // Match ratings that round to this value (e.g., rating=7 matches 6.5-7.4)
    query = query.gte("rating", ratingNum - 0.5).lt("rating", ratingNum + 0.5);
  }

  // Apply sorting
  const validSortFields = [
    "added_at", "finished_at", "started_at", "title", "author",
    "rating", "pages", "sort_order", "format", "source", "priority", "genre"
  ];
  const field = validSortFields.includes(sortBy) ? sortBy : "added_at";
  query = query.order(field, { ascending: sortDir === "asc", nullsFirst: false });

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter by finished year/month (done client-side since Supabase doesn't have date part extraction)
  let filteredData = data;
  if (finishedYear) {
    const year = parseInt(finishedYear);
    filteredData = filteredData.filter((b: Book) => {
      if (!b.finished_at) return false;
      return new Date(b.finished_at).getFullYear() === year;
    });
  }
  if (finishedMonth) {
    const month = parseInt(finishedMonth);
    filteredData = filteredData.filter((b: Book) => {
      if (!b.finished_at) return false;
      return new Date(b.finished_at).getMonth() + 1 === month;
    });
  }

  // Calculate time_to_read for each book (in days)
  const booksWithTimeToRead = filteredData.map((book: Book) => {
    let timeToRead: number | null = null;
    if (book.started_at && book.finished_at) {
      const start = new Date(book.started_at);
      const end = new Date(book.finished_at);
      timeToRead = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }
    return { ...book, time_to_read: timeToRead };
  });

  // If sorting by time_to_read, do it client-side since it's a computed field
  if (sortBy === "time_to_read") {
    booksWithTimeToRead.sort((a: Book & { time_to_read: number | null }, b: Book & { time_to_read: number | null }) => {
      if (a.time_to_read === null) return sortDir === "asc" ? 1 : -1;
      if (b.time_to_read === null) return sortDir === "asc" ? -1 : 1;
      return sortDir === "asc"
        ? a.time_to_read - b.time_to_read
        : b.time_to_read - a.time_to_read;
    });
  }

  return NextResponse.json({ books: booksWithTimeToRead });
}

// POST /api/books - Create a new book
export async function POST(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BookSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return NextResponse.json({ error: msg || "Invalid input" }, { status: 400 });
  }

  const body = parsed.data;

  // Check for existing books with same title+author for re-read detection
  const { data: existing } = await supabase
    .from("books")
    .select("id, reading_number")
    .eq("owner_id", user.id)
    .ilike("title", body.title.trim())
    .ilike("author", body.author.trim())
    .order("reading_number", { ascending: false })
    .limit(1);

  // If this is a re-read and reading_number wasn't explicitly set, increment it
  let readingNumber = body.reading_number;
  if (existing && existing.length > 0 && body.reading_number === 1) {
    readingNumber = existing[0].reading_number + 1;
  }

  const { data, error } = await supabase
    .from("books")
    .insert({
      owner_id: user.id,
      title: body.title.trim(),
      author: body.author.trim(),
      pages: body.pages ?? null,
      genre: body.genre?.trim() ?? null,
      cover_url: body.cover_url ?? null,
      open_library_key: body.open_library_key ?? null,
      format: body.format ?? null,
      source: body.source ?? null,
      status: body.status,
      priority: body.priority ?? null,
      added_at: body.added_at ?? null,
      started_at: body.started_at ?? null,
      finished_at: body.finished_at ?? null,
      rating: body.rating ?? null,
      notes: body.notes?.trim() ?? null,
      would_reread: body.would_reread ?? false,
      reading_number: readingNumber,
      sort_order: body.sort_order ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ book: data, isReread: readingNumber > 1 });
}
