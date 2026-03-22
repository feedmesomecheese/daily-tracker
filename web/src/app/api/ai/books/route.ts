import { NextResponse } from "next/server";
import { validateAiKey, getAiSupabase, getAiOwnerId } from "@/lib/aiAuth";

export async function GET(req: Request) {
  const authError = validateAiKey(req);
  if (authError) return authError;

  const supabase = getAiSupabase();
  const ownerId = getAiOwnerId();

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // to_read | reading | completed | dnf

  let query = supabase
    .from("books")
    .select("title, author, pages, genre, format, source, status, priority, added_at, started_at, finished_at, rating, notes, would_reread, reading_number")
    .eq("owner_id", ownerId)
    .order("finished_at", { ascending: false, nullsFirst: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const books = (data || []).map((b) => ({
    title: b.title,
    author: b.author,
    pages: b.pages,
    genre: b.genre,
    format: b.format,
    source: b.source,
    status: b.status,
    priority: b.priority,
    added_at: b.added_at,
    started_at: b.started_at,
    finished_at: b.finished_at,
    rating: b.rating,
    notes: b.notes,
    would_reread: b.would_reread,
    reading_number: b.reading_number,
  }));

  const counts = {
    total: books.length,
    completed: books.filter((b) => b.status === "completed").length,
    reading: books.filter((b) => b.status === "reading").length,
    to_read: books.filter((b) => b.status === "to_read").length,
    dnf: books.filter((b) => b.status === "dnf").length,
  };

  return NextResponse.json({ counts, books });
}
