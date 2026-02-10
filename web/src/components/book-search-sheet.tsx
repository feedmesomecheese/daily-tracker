"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarcodeScanner } from "@/components/barcode-scanner";
import type { BookSearchResult } from "@/app/api/books/search/route";

type BookSearchSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookAdded: () => void;
};

type FormData = {
  title: string;
  author: string;
  pages: string;
  genre: string;
  cover_url: string;
  open_library_key: string;
  format: string;
  source: string;
  status: string;
  priority: string;
  started_at: string;
  finished_at: string;
  rating: string;
  notes: string;
  would_reread: boolean;
};

const initialFormData: FormData = {
  title: "",
  author: "",
  pages: "",
  genre: "",
  cover_url: "",
  open_library_key: "",
  format: "",
  source: "",
  status: "to_read",
  priority: "",
  started_at: "",
  finished_at: "",
  rating: "",
  notes: "",
  would_reread: false,
};

export function BookSearchSheet({ open, onOpenChange, onBookAdded }: BookSearchSheetProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [step, setStep] = useState<"search" | "form">("search");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [lookingUpIsbn, setLookingUpIsbn] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setStep("search");
      setQuery("");
      setResults([]);
      setFormData(initialFormData);
      setError(null);
      setShowScanner(false);
      setLookingUpIsbn(false);
    }
  }, [open]);

  // Debounced search
  const searchBooks = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(searchQuery)}`, { headers });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Search failed");
      }

      setResults(json.results || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        searchBooks(query);
      }, 400);
    } else {
      setResults([]);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchBooks]);

  // Handle barcode scan - lookup ISBN
  const handleBarcodeScan = useCallback(async (isbn: string) => {
    setShowScanner(false);
    setLookingUpIsbn(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/books/isbn?isbn=${encodeURIComponent(isbn)}`, { headers });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "ISBN lookup failed");
      }

      if (json.result) {
        selectBook(json.result);
      } else {
        setError("Book not found for this ISBN");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ISBN lookup failed");
    } finally {
      setLookingUpIsbn(false);
    }
  }, []);

  const selectBook = (result: BookSearchResult) => {
    setFormData({
      ...initialFormData,
      title: result.title,
      author: result.author,
      pages: result.pages?.toString() || "",
      genre: result.genres[0] || "",
      cover_url: result.cover_url || "",
      open_library_key: result.open_library_key,
    });
    setStep("form");
  };

  const addManually = () => {
    setFormData({
      ...initialFormData,
      title: query,
    });
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const body = {
        title: formData.title,
        author: formData.author,
        pages: formData.pages ? parseInt(formData.pages) : null,
        genre: formData.genre || null,
        cover_url: formData.cover_url || null,
        open_library_key: formData.open_library_key || null,
        format: formData.format || null,
        source: formData.source || null,
        status: formData.status || "to_read",
        priority: formData.priority ? parseInt(formData.priority) : null,
        started_at: formData.started_at || null,
        finished_at: formData.finished_at || null,
        rating: formData.rating ? parseFloat(formData.rating) : null,
        notes: formData.notes || null,
        would_reread: formData.would_reread,
      };

      const res = await fetch("/api/books", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Failed to add book");
      }

      onBookAdded();
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add book");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[90vh] overflow-hidden flex flex-col rounded-t-xl"
            : "sm:max-w-[480px] overflow-hidden flex flex-col"
        }
      >
        {isMobile && (
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        <SheetHeader className="flex-shrink-0">
          <SheetTitle>{step === "search" ? "Add Book" : "Book Details"}</SheetTitle>
          <SheetDescription>
            {step === "search"
              ? "Search for a book or add manually"
              : "Fill in the details for your book"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {step === "search" && (
            <>
              {/* Scan barcode button */}
              <Button
                variant="outline"
                onClick={() => setShowScanner(true)}
                className="w-full flex items-center justify-center gap-2"
                disabled={lookingUpIsbn}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <line x1="7" y1="12" x2="17" y2="12" />
                  <line x1="7" y1="8" x2="10" y2="8" />
                  <line x1="7" y1="16" x2="10" y2="16" />
                  <line x1="14" y1="8" x2="17" y2="8" />
                  <line x1="14" y1="16" x2="17" y2="16" />
                </svg>
                {lookingUpIsbn ? "Looking up ISBN..." : "Scan Barcode"}
              </Button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or search</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Search by title or author..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full h-10 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>

              {searching && (
                <p className="text-sm text-muted-foreground">Searching...</p>
              )}

              {results.length > 0 && (
                <div className="space-y-2">
                  {results.map((result, i) => (
                    <button
                      key={`${result.open_library_key}-${i}`}
                      onClick={() => selectBook(result)}
                      className="w-full text-left p-3 border rounded-lg hover:bg-accent transition-colors flex gap-3"
                    >
                      {result.cover_url ? (
                        <img
                          src={result.cover_url}
                          alt=""
                          className="w-10 h-14 object-cover rounded flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-muted rounded flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{result.title}</p>
                        <p className="text-xs text-muted-foreground">{result.author}</p>
                        <p className="text-xs text-muted-foreground">
                          {result.year && `${result.year} · `}
                          {result.pages && `${result.pages} pages`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {query.length >= 2 && !searching && results.length === 0 && (
                <p className="text-sm text-muted-foreground">No results found</p>
              )}

              <Button variant="outline" onClick={addManually} className="w-full">
                Add Manually
              </Button>
            </>
          )}

          {step === "form" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formData.cover_url && (
                <div className="flex justify-center">
                  <img
                    src={formData.cover_url}
                    alt=""
                    className="h-32 object-cover rounded shadow"
                  />
                </div>
              )}

              <div className="grid gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    required
                    className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Author *</label>
                  <input
                    type="text"
                    value={formData.author}
                    onChange={(e) => updateField("author", e.target.value)}
                    required
                    className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Pages</label>
                    <input
                      type="number"
                      value={formData.pages}
                      onChange={(e) => updateField("pages", e.target.value)}
                      className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">Genre</label>
                    <input
                      type="text"
                      value={formData.genre}
                      onChange={(e) => updateField("genre", e.target.value)}
                      className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Format</label>
                    <Select value={formData.format} onValueChange={(v) => updateField("format", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="physical">Physical</SelectItem>
                        <SelectItem value="ebook">eBook</SelectItem>
                        <SelectItem value="audio">Audiobook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">Source</label>
                    <Select value={formData.source} onValueChange={(v) => updateField("source", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owned">Owned</SelectItem>
                        <SelectItem value="library">Library</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Status</label>
                    <Select value={formData.status} onValueChange={(v) => updateField("status", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="to_read">To Read</SelectItem>
                        <SelectItem value="reading">Reading</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="dnf">DNF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">Priority (1-5)</label>
                    <Select value={formData.priority} onValueChange={(v) => updateField("priority", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 - Low</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3 - Medium</SelectItem>
                        <SelectItem value="4">4</SelectItem>
                        <SelectItem value="5">5 - High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Started</label>
                    <input
                      type="date"
                      value={formData.started_at}
                      onChange={(e) => updateField("started_at", e.target.value)}
                      className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">Finished</label>
                    <input
                      type="date"
                      value={formData.finished_at}
                      onChange={(e) => updateField("finished_at", e.target.value)}
                      className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Rating (0-10)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={formData.rating}
                    onChange={(e) => updateField("rating", e.target.value)}
                    className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.would_reread}
                    onChange={(e) => updateField("would_reread", e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Would reread
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("search")}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? "Saving..." : "Add Book"}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Barcode Scanner Modal */}
        {showScanner && (
          <BarcodeScanner
            onScan={handleBarcodeScan}
            onClose={() => setShowScanner(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
