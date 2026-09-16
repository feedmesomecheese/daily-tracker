import { AgentInputError, type AgentTool } from "../types";

const BOOK_STATUSES = ["to_read", "reading", "completed", "dnf"];

const getBooks: AgentTool = {
  name: "getBooks",
  path: "/api/ai/books",
  method: "GET",
  readOnly: true,
  summary: "Get reading list with stats",
  description:
    "Returns stats: counts (all statuses), year_stats (books/pages/avg rating per year), genre_stats (count/avg rating per genre). Books array is empty unless filtered — always use status or year to retrieve books. Ratings are 0–10.",
  responseDescription: "Book list with reading stats by year and genre",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Filter books by status.",
        enum: BOOK_STATUSES,
      },
      year: {
        type: "string",
        description:
          "Filter books by the year they were finished. Only applies to the books array — counts and stats always cover all time.",
      },
      limit: {
        type: "integer",
        description: "Max books to return (default 50, max 200). Use with status/year filters.",
        default: 50,
        minimum: 1,
        maximum: 200,
      },
    },
  },
  handler: async (ctx, input) => {
    const status = (input.status as string) || null;
    const year = (input.year as string) || null;

    const { data: allBooks, error } = await ctx.supabase
      .from("books")
      .select(
        "title, author, pages, genre, format, source, status, priority, added_at, started_at, finished_at, rating, notes, would_reread, reading_number"
      )
      .eq("owner_id", ctx.ownerId)
      .order("finished_at", { ascending: false, nullsFirst: false });

    if (error) throw new Error(error.message);

    const all = allBooks ?? [];

    const counts = {
      total: all.length,
      completed: all.filter((b) => b.status === "completed").length,
      reading: all.filter((b) => b.status === "reading").length,
      to_read: all.filter((b) => b.status === "to_read").length,
      dnf: all.filter((b) => b.status === "dnf").length,
    };

    const completed = all.filter((b) => b.status === "completed" && b.finished_at);
    const statsByYear: Record<
      string,
      { books: number; pages: number; ratings: number[]; genres: Record<string, number> }
    > = {};

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
        avg_rating:
          s.ratings.length > 0
            ? Math.round((s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length) * 10) / 10
            : null,
        top_genres: Object.entries(s.genres)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([g, n]) => ({ genre: g, count: n })),
      }));

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
        avg_rating:
          s.ratings.length > 0
            ? Math.round((s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length) * 10) / 10
            : null,
      }));

    const limit = Math.min((input.limit as number) ?? 50, 200);

    let books: typeof all = [];
    let booksNote: string | undefined;

    if (status || year) {
      let filtered = all;
      if (status) filtered = filtered.filter((b) => b.status === status);
      if (year) filtered = filtered.filter((b) => b.finished_at && String(b.finished_at).startsWith(year));
      const total = filtered.length;
      books = filtered.slice(0, limit);
      if (total > limit) {
        booksNote = `Showing ${limit} of ${total} books (most recent first). Use limit (max 200) or narrow with year to get more.`;
      }
    } else {
      booksNote = "Use status or year to retrieve the books list. Counts and stats above cover all time.";
    }

    return {
      counts,
      year_stats: yearStats,
      genre_stats: genreStats,
      books,
      ...(booksNote ? { note: booksNote } : {}),
    };
  },
};

const addBook: AgentTool = {
  name: "addBook",
  path: "/api/ai/books",
  method: "POST",
  readOnly: false,
  summary: "Add a book to the reading list",
  description:
    "Adds a book with the given status. If the same title and author already exist, this is recorded as a re-read with an incremented reading number rather than replacing the original entry. Ratings are 0–10.",
  responseDescription: "The created book",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "author", "status"],
    properties: {
      title: { type: "string", description: "Book title." },
      author: { type: "string", description: "Author name." },
      status: { type: "string", description: "Reading status.", enum: BOOK_STATUSES },
      pages: { type: "integer", description: "Page count.", minimum: 0 },
      genre: { type: "string", description: "Genre." },
      format: { type: "string", description: "Format, e.g. \"physical\", \"ebook\", \"audiobook\"." },
      source: { type: "string", description: "Where the book came from, e.g. \"library\", \"purchased\"." },
      rating: { type: "number", description: "Rating from 0 to 10.", minimum: 0, maximum: 10 },
      started_at: { type: "string", format: "date", description: "Date started, YYYY-MM-DD." },
      finished_at: { type: "string", format: "date", description: "Date finished, YYYY-MM-DD." },
      notes: { type: "string", description: "Notes about the book." },
      would_reread: { type: "boolean", description: "Whether the user would read it again." },
    },
  },
  handler: async (ctx, input) => {
    const title = String(input.title).trim();
    const author = String(input.author).trim();

    if (!title || !author) {
      throw new AgentInputError("title and author are both required and cannot be empty");
    }

    // Re-read detection, matching the behaviour of the web UI.
    const { data: existing } = await ctx.supabase
      .from("books")
      .select("id, reading_number")
      .eq("owner_id", ctx.ownerId)
      .ilike("title", title)
      .ilike("author", author)
      .order("reading_number", { ascending: false })
      .limit(1);

    const readingNumber = existing && existing.length > 0 ? existing[0].reading_number + 1 : 1;

    const { data, error } = await ctx.supabase
      .from("books")
      .insert({
        owner_id: ctx.ownerId,
        title,
        author,
        pages: (input.pages as number) ?? null,
        genre: typeof input.genre === "string" ? input.genre.trim() : null,
        status: input.status as string,
        format: (input.format as string) ?? null,
        source: (input.source as string) ?? null,
        rating: (input.rating as number) ?? null,
        started_at: (input.started_at as string) ?? null,
        finished_at: (input.finished_at as string) ?? null,
        notes: typeof input.notes === "string" ? input.notes.trim() : null,
        would_reread: input.would_reread === true,
        reading_number: readingNumber,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return { book: data, is_reread: readingNumber > 1 };
  },
};

const updateBook: AgentTool = {
  name: "updateBook",
  path: "/api/ai/books/update",
  method: "POST",
  readOnly: false,
  summary: "Update a book's status, rating or notes",
  description:
    "Updates an existing book, found by title and author. Use this to mark a book finished, set a rating, or add notes. Only the fields given are changed.",
  responseDescription: "The updated book",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["title"],
    properties: {
      title: { type: "string", description: "Title of the book to update (case-insensitive match)." },
      author: {
        type: "string",
        description: "Author, to disambiguate when several books share a title.",
      },
      status: { type: "string", description: "New reading status.", enum: BOOK_STATUSES },
      rating: { type: "number", description: "Rating from 0 to 10.", minimum: 0, maximum: 10 },
      started_at: { type: "string", format: "date", description: "Date started, YYYY-MM-DD." },
      finished_at: { type: "string", format: "date", description: "Date finished, YYYY-MM-DD." },
      notes: { type: "string", description: "Notes about the book." },
      would_reread: { type: "boolean", description: "Whether the user would read it again." },
    },
  },
  handler: async (ctx, input) => {
    const title = String(input.title).trim();

    let query = ctx.supabase
      .from("books")
      .select("id, title, author, reading_number")
      .eq("owner_id", ctx.ownerId)
      .ilike("title", title);

    if (typeof input.author === "string" && input.author.trim()) {
      query = query.ilike("author", input.author.trim());
    }

    const { data: matches, error: findErr } = await query
      .order("reading_number", { ascending: false })
      .limit(5);

    if (findErr) throw new Error(findErr.message);

    if (!matches || matches.length === 0) {
      throw new AgentInputError(
        `No book found matching "${title}"${input.author ? ` by ${String(input.author)}` : ""}. Use addBook to create it.`
      );
    }

    if (matches.length > 1) {
      const options = matches.map((b) => `${b.title} by ${b.author}`).join("; ");
      throw new AgentInputError(
        `Several books match "${title}": ${options}. Pass author to pick one.`
      );
    }

    const updates: Record<string, unknown> = {};
    if (input.status !== undefined) updates.status = input.status;
    if (input.rating !== undefined) updates.rating = Number(input.rating);
    if (input.started_at !== undefined) updates.started_at = input.started_at;
    if (input.finished_at !== undefined) updates.finished_at = input.finished_at;
    if (input.notes !== undefined) updates.notes = String(input.notes).trim() || null;
    if (input.would_reread !== undefined) updates.would_reread = input.would_reread === true;

    if (Object.keys(updates).length === 0) {
      throw new AgentInputError("Nothing to update — pass at least one field to change.");
    }

    const { data, error } = await ctx.supabase
      .from("books")
      .update(updates)
      .eq("id", matches[0].id)
      .eq("owner_id", ctx.ownerId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return { book: data, updated_fields: Object.keys(updates) };
  },
};

export const bookTools: AgentTool[] = [getBooks, addBook, updateBook];
