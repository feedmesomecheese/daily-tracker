"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Button } from "@/components/ui/button";
import { BookCard, BookCardSkeleton, type Book } from "@/components/book-card";
import { BookSearchSheet } from "@/components/book-search-sheet";
import { BookEditSheet } from "@/components/book-edit-sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageTour } from "@/hooks/usePageTour";
import "driver.js/dist/driver.css";

type StatusFilter = "all" | "to_read" | "reading" | "completed" | "dnf";

type Stats = {
  overview: {
    total: number;
    completed: number;
    reading: number;
    toRead: number;
    dnf: number;
  };
  pages: {
    total: number;
    average: number;
    thisYear: number;
  };
  ratings: {
    average: number | null;
    ratedCount: number;
  };
  thisYear: {
    books: number;
    pages: number;
  };
  topGenres: { genre: string; count: number }[];
};

const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "to_read", label: "To Read" },
  { value: "reading", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "dnf", label: "DNF" },
];

const sortOptions = [
  { value: "added_at:desc", label: "Recently Added" },
  { value: "added_at:asc", label: "Oldest Added" },
  { value: "title:asc", label: "Title A-Z" },
  { value: "title:desc", label: "Title Z-A" },
  { value: "author:asc", label: "Author A-Z" },
  { value: "author:desc", label: "Author Z-A" },
  { value: "started_at:desc", label: "Recently Started" },
  { value: "finished_at:desc", label: "Recently Finished" },
  { value: "rating:desc", label: "Highest Rating" },
  { value: "rating:asc", label: "Lowest Rating" },
  { value: "pages:desc", label: "Most Pages" },
  { value: "pages:asc", label: "Fewest Pages" },
  { value: "time_to_read:asc", label: "Fastest Read" },
  { value: "time_to_read:desc", label: "Slowest Read" },
  { value: "priority:desc", label: "Highest Priority" },
  { value: "priority:asc", label: "Lowest Priority" },
];

const formatOptions = [
  { value: "all", label: "All Formats" },
  { value: "physical", label: "Physical" },
  { value: "ebook", label: "eBook" },
  { value: "audio", label: "Audiobook" },
];

const sourceOptions = [
  { value: "all", label: "All Sources" },
  { value: "owned", label: "Owned" },
  { value: "library", label: "Library" },
];

export default function BooksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [books, setBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  // Tour
  const { completed: tourCompleted, complete: tourComplete, devReset: tourDevReset } = usePageTour("books");
  const tourLaunched = useRef(false);

  // Read filters from URL params
  const statusFilter = (searchParams.get("status") || "all") as StatusFilter;
  const sortValue = searchParams.get("sortBy")
    ? `${searchParams.get("sortBy")}:${searchParams.get("sortDir") || "desc"}`
    : "added_at:desc";
  const formatFilter = searchParams.get("format") || "all";
  const sourceFilter = searchParams.get("source") || "all";
  const genreFilter = searchParams.get("genre") || "all";
  const authorFilter = searchParams.get("author") || "";
  const ratingFilter = searchParams.get("rating") || "";
  const finishedYear = searchParams.get("finishedYear") || "";
  const finishedMonth = searchParams.get("finishedMonth") || "";
  const includeWouldReread = searchParams.get("includeWouldReread") !== "false";

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  // Helper to update URL params
  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.push(`/books?${params.toString()}`, { scroll: false });
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchBooks = useCallback(async () => {
    try {
      setError(null);
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();

      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const [sortBy, sortDir] = sortValue.split(":");
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);

      if (formatFilter !== "all") {
        params.set("format", formatFilter);
      }
      if (sourceFilter !== "all") {
        params.set("source", sourceFilter);
      }
      if (genreFilter !== "all") {
        params.set("genre", genreFilter);
      }
      if (authorFilter) {
        params.set("author", authorFilter);
      }
      if (ratingFilter) {
        params.set("rating", ratingFilter);
      }
      if (finishedYear) {
        params.set("finishedYear", finishedYear);
      }
      if (finishedMonth) {
        params.set("finishedMonth", finishedMonth);
      }
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }
      if (statusFilter === "to_read" && includeWouldReread) {
        params.set("includeWouldReread", "true");
      }

      const res = await fetch(`/api/books?${params}`, { headers });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Failed to load books");
      }

      setBooks(json.books || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load books");
    }
  }, [statusFilter, sortValue, formatFilter, sourceFilter, genreFilter, authorFilter, ratingFilter, finishedYear, finishedMonth, debouncedSearch, includeWouldReread]);

  const fetchStats = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/books/stats", { headers });
      const json = await res.json();

      if (res.ok) {
        setStats(json);
      }
    } catch {
      // Stats are optional, don't show error
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchBooks(), fetchStats()]);
    setLoading(false);
  }, [fetchBooks, fetchStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBookClick = (book: Book) => {
    setSelectedBook(book);
    setEditSheetOpen(true);
  };

  const handleBookAdded = () => {
    loadData();
  };

  const handleBookUpdated = () => {
    loadData();
  };

  const handleBookDeleted = () => {
    loadData();
  };

  const genres = stats?.topGenres?.map((g) => g.genre) || [];

  // --- Books Tour ---
  const launchBooksTour = useCallback(() => {
    import("driver.js").then(({ driver }) => {
      const driverObj = driver({
        animate: true,
        showProgress: true,
        allowClose: false,
        steps: [
          {
            popover: {
              title: "Your Reading Log",
              description:
                "Track every book you've read, want to read, or are currently reading — with ratings, notes, reading dates, and stats.",
              nextBtnText: "Next →",
            },
          },
          {
            element: "[data-tour='add-book-btn']",
            popover: {
              title: "Adding Books",
              description:
                "Search millions of books by title, author, or ISBN. Cover art, page count, and genre fill in automatically from Open Library — no manual entry needed.",
              side: "bottom",
              align: "end",
              nextBtnText: "Next →",
            },
          },
          {
            element: "[data-tour='books-tabs']",
            popover: {
              title: "Reading Status",
              description:
                "Filter by To Read, Reading, Completed, or DNF (Did Not Finish). Books marked 'Would Reread' also appear in your To Read queue when that option is on.",
              side: "bottom",
              align: "start",
              nextBtnText: "Next →",
            },
          },
          {
            element: "[data-tour='books-filters']",
            popover: {
              title: "Sort & Filter",
              description:
                "Sort by rating, page count, time-to-read, or finish date. Filter by format (physical, ebook, audio), source (owned vs. library), or genre.",
              side: "bottom",
              align: "start",
              nextBtnText: "Next →",
            },
          },
          {
            popover: {
              title: "Stats & Book Details",
              description:
                "Click any book to edit its status, rating (1–10), notes, and dates. The Stats page (link in the nav) shows yearly charts, genre breakdowns, and reading pace.",
              nextBtnText: "Got it!",
              onNextClick: () => {
                driverObj.destroy();
                tourComplete();
              },
            },
          },
        ],
      });
      driverObj.drive();
    });
  }, [tourComplete]);

  // Auto-launch on first visit when library is empty
  useEffect(() => {
    if (loading || tourCompleted || tourLaunched.current) return;
    if (books.length > 0) return;
    tourLaunched.current = true;
    setTimeout(launchBooksTour, 400);
  }, [loading, tourCompleted, books.length, launchBooksTour]);

  return (
    <main className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Books</h1>
          {tourCompleted && (
            <button
              onClick={() => { tourDevReset(); setTimeout(launchBooksTour, 50); }}
              className="text-xs text-muted-foreground hover:text-foreground border rounded-full w-5 h-5 flex items-center justify-center"
              title="Replay tour"
            >
              ?
            </button>
          )}
        </div>
        <Button data-tour="add-book-btn" onClick={() => setAddSheetOpen(true)}>Add Book</Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div data-tour="books-stats" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total Books</p>
            <p className="text-2xl font-bold">{stats.overview.total}</p>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold">{stats.overview.completed}</p>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Pages Read</p>
            <p className="text-2xl font-bold">{stats.pages.total.toLocaleString()}</p>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">This Year</p>
            <p className="text-2xl font-bold">{stats.thisYear.books} books</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title or author..."
          className="w-full h-10 px-4 pr-10 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>

      {/* Filters Row */}
      <div data-tour="books-filters" className="flex flex-wrap gap-2 items-center">
        <Select
          value={sortValue}
          onValueChange={(v) => {
            const [sortBy, sortDir] = v.split(":");
            updateParams({ sortBy, sortDir });
          }}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={formatFilter} onValueChange={(v) => updateParams({ format: v })}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            {formatOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={(v) => updateParams({ source: v })}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {sourceOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {genres.length > 0 && (
          <Select value={genreFilter} onValueChange={(v) => updateParams({ genre: v })}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Genre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Genres</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Active Filters Display */}
      {(finishedYear || finishedMonth || authorFilter || ratingFilter) && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">Filters:</span>
          {finishedYear && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full flex items-center gap-1">
              Year: {finishedYear}
              <button onClick={() => updateParams({ finishedYear: null })} className="hover:text-destructive">×</button>
            </span>
          )}
          {finishedMonth && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full flex items-center gap-1">
              Month: {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(finishedMonth) - 1]}
              <button onClick={() => updateParams({ finishedMonth: null })} className="hover:text-destructive">×</button>
            </span>
          )}
          {authorFilter && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full flex items-center gap-1">
              Author: {authorFilter}
              <button onClick={() => updateParams({ author: null })} className="hover:text-destructive">×</button>
            </span>
          )}
          {ratingFilter && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full flex items-center gap-1">
              Rating: {ratingFilter}
              <button onClick={() => updateParams({ rating: null })} className="hover:text-destructive">×</button>
            </span>
          )}
          <button
            onClick={() => updateParams({ finishedYear: null, finishedMonth: null, author: null, rating: null })}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Status Tabs */}
      <div data-tour="books-tabs" className="flex gap-2 overflow-x-auto pb-1">
        {statusTabs.map((tab) => (
          <Button
            key={tab.value}
            variant={statusFilter === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => updateParams({ status: tab.value === "all" ? null : tab.value })}
            className="flex-shrink-0"
          >
            {tab.label}
            {stats && (
              <span className="ml-1.5 text-xs opacity-70">
                {tab.value === "all"
                  ? stats.overview.total
                  : tab.value === "to_read"
                  ? stats.overview.toRead
                  : tab.value === "reading"
                  ? stats.overview.reading
                  : tab.value === "completed"
                  ? stats.overview.completed
                  : stats.overview.dnf}
              </span>
            )}
          </Button>
        ))}

        {statusFilter === "to_read" && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2 whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeWouldReread}
              onChange={(e) => updateParams({ includeWouldReread: e.target.checked ? null : "false" })}
              className="rounded"
            />
            Include "Would Reread"
          </label>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Book List */}
      {!loading && books.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No books found</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setAddSheetOpen(true)}
          >
            Add your first book
          </Button>
        </div>
      )}

      {!loading && books.length > 0 && (
        <div className="space-y-3">
          {books.map((book) => (
            <BookCard key={book.id} book={book} onClick={() => handleBookClick(book)} />
          ))}
        </div>
      )}

      {/* Sheets */}
      <BookSearchSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onBookAdded={handleBookAdded}
      />

      <BookEditSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        book={selectedBook}
        onBookUpdated={handleBookUpdated}
        onBookDeleted={handleBookDeleted}
      />

      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            onClick={() => {
              tourDevReset();
              tourLaunched.current = false;
            }}
          >
            Reset Tour ({tourCompleted ? "completed" : "not started"})
          </Button>
        </div>
      )}
    </main>
  );
}
