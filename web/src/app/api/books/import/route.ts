import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

const ImportBookSchema = z.object({
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
});

const ImportRequestSchema = z.object({
  books: z.array(ImportBookSchema),
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

// POST /api/books/import - Bulk import books
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

  const parsed = ImportRequestSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return NextResponse.json({ error: msg || "Invalid input" }, { status: 400 });
  }

  const { books } = parsed.data;

  if (books.length === 0) {
    return NextResponse.json({ error: "No books to import" }, { status: 400 });
  }

  if (books.length > 1000) {
    return NextResponse.json({ error: "Maximum 1000 books per import" }, { status: 400 });
  }

  // Prepare rows for insert
  const rows = books.map((book) => ({
    owner_id: user.id,
    title: book.title.trim(),
    author: book.author.trim(),
    pages: book.pages ?? null,
    genre: book.genre?.trim() ?? null,
    cover_url: book.cover_url ?? null,
    open_library_key: book.open_library_key ?? null,
    format: book.format ?? null,
    source: book.source ?? null,
    status: book.status,
    priority: book.priority ?? null,
    added_at: book.added_at ?? null,
    started_at: book.started_at ?? null,
    finished_at: book.finished_at ?? null,
    rating: book.rating ?? null,
    notes: book.notes?.trim() ?? null,
    would_reread: book.would_reread ?? false,
    reading_number: book.reading_number ?? 1,
  }));

  // Insert in batches of 100
  const batchSize = 100;
  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("books").insert(batch);

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      imported += batch.length;
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    imported,
    total: books.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
