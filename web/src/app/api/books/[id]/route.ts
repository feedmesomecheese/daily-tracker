import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

const UpdateBookSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  pages: z.number().int().positive().nullable().optional(),
  genre: z.string().nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  open_library_key: z.string().nullable().optional(),
  format: z.enum(["physical", "ebook", "audio"]).nullable().optional(),
  source: z.enum(["owned", "library"]).nullable().optional(),
  status: z.enum(["to_read", "reading", "completed", "dnf"]).optional(),
  priority: z.number().int().min(1).max(5).nullable().optional(),
  added_at: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  rating: z.number().min(0).max(10).nullable().optional(),
  notes: z.string().nullable().optional(),
  would_reread: z.boolean().optional(),
  reading_number: z.number().int().min(1).optional(),
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

// GET /api/books/[id] - Get a single book
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("owner_id", user.id)
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  return NextResponse.json({ book: data });
}

// PATCH /api/books/[id] - Update a book
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateBookSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return NextResponse.json({ error: msg || "Invalid input" }, { status: 400 });
  }

  const body = parsed.data;

  // Build update object only with provided fields
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.author !== undefined) updates.author = body.author.trim();
  if (body.pages !== undefined) updates.pages = body.pages;
  if (body.genre !== undefined) updates.genre = body.genre?.trim() ?? null;
  if (body.cover_url !== undefined) updates.cover_url = body.cover_url;
  if (body.open_library_key !== undefined) updates.open_library_key = body.open_library_key;
  if (body.format !== undefined) updates.format = body.format;
  if (body.source !== undefined) updates.source = body.source;
  if (body.status !== undefined) updates.status = body.status;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.added_at !== undefined) updates.added_at = body.added_at;
  if (body.started_at !== undefined) updates.started_at = body.started_at;
  if (body.finished_at !== undefined) updates.finished_at = body.finished_at;
  if (body.rating !== undefined) updates.rating = body.rating;
  if (body.notes !== undefined) updates.notes = body.notes?.trim() ?? null;
  if (body.would_reread !== undefined) updates.would_reread = body.would_reread;
  if (body.reading_number !== undefined) updates.reading_number = body.reading_number;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { data, error } = await supabase
    .from("books")
    .update(updates)
    .eq("owner_id", user.id)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  return NextResponse.json({ book: data });
}

// DELETE /api/books/[id] - Delete a book
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from("books")
    .delete()
    .eq("owner_id", user.id)
    .eq("id", id)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Book not found or already deleted" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: id });
}
