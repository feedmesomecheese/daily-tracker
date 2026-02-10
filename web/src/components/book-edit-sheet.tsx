"use client";

import { useState, useEffect } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Book } from "@/components/book-card";

type BookEditSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onBookUpdated: () => void;
  onBookDeleted: () => void;
};

type FormData = {
  title: string;
  author: string;
  pages: string;
  genre: string;
  cover_url: string;
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

export function BookEditSheet({
  open,
  onOpenChange,
  book,
  onBookUpdated,
  onBookDeleted,
}: BookEditSheetProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [formData, setFormData] = useState<FormData>({
    title: "",
    author: "",
    pages: "",
    genre: "",
    cover_url: "",
    format: "",
    source: "",
    status: "to_read",
    priority: "",
    started_at: "",
    finished_at: "",
    rating: "",
    notes: "",
    would_reread: false,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchingCover, setSearchingCover] = useState(false);
  const [coverOptions, setCoverOptions] = useState<string[]>([]);
  const [showCoverPicker, setShowCoverPicker] = useState(false);

  // Populate form when book changes
  useEffect(() => {
    if (book) {
      setFormData({
        title: book.title,
        author: book.author,
        pages: book.pages?.toString() || "",
        genre: book.genre || "",
        cover_url: book.cover_url || "",
        format: book.format || "",
        source: book.source || "",
        status: book.status,
        priority: book.priority?.toString() || "",
        started_at: book.started_at || "",
        finished_at: book.finished_at || "",
        rating: book.rating?.toString() || "",
        notes: book.notes || "",
        would_reread: book.would_reread,
      });
      setError(null);
      setDeleteDialogOpen(false);
    }
  }, [book]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!book) return;

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
        format: formData.format || null,
        source: formData.source || null,
        status: formData.status,
        priority: formData.priority ? parseInt(formData.priority) : null,
        started_at: formData.started_at || null,
        finished_at: formData.finished_at || null,
        rating: formData.rating ? parseFloat(formData.rating) : null,
        notes: formData.notes || null,
        would_reread: formData.would_reread,
      };

      const res = await fetch(`/api/books/${book.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Failed to update book");
      }

      onBookUpdated();
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update book");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!book) return;

    setDeleting(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/books/${book.id}`, {
        method: "DELETE",
        headers,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Failed to delete book");
      }

      setDeleteDialogOpen(false);
      onBookDeleted();
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete book");
    } finally {
      setDeleting(false);
    }
  };

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFindCover = async () => {
    if (!formData.title) return;

    setSearchingCover(true);
    setError(null);
    setCoverOptions([]);

    try {
      const headers = await getAuthHeaders();
      const query = `${formData.title} ${formData.author}`.trim();
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(query)}`, { headers });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Search failed");
      }

      const results = json.results || [];
      if (results.length === 0) {
        setError("No covers found for this book");
        return;
      }

      // Collect all unique cover options from all results
      const allCovers: string[] = [];
      for (const result of results) {
        if (result.cover_options) {
          for (const cover of result.cover_options) {
            if (!allCovers.includes(cover)) {
              allCovers.push(cover);
            }
          }
        } else if (result.cover_url && !allCovers.includes(result.cover_url)) {
          allCovers.push(result.cover_url);
        }
      }

      if (allCovers.length === 0) {
        setError("No covers found for this book");
        return;
      }

      if (allCovers.length === 1) {
        updateField("cover_url", allCovers[0]);
      } else {
        setCoverOptions(allCovers);
        setShowCoverPicker(true);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to search for cover");
    } finally {
      setSearchingCover(false);
    }
  };

  const selectCover = (url: string) => {
    updateField("cover_url", url);
    setShowCoverPicker(false);
    setCoverOptions([]);
  };

  if (!book) return null;

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
          <SheetTitle>Edit Book</SheetTitle>
          <SheetDescription>
            {book.reading_number > 1
              ? `Reading #${book.reading_number}`
              : "Update book details"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4">
          {error && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              {formData.cover_url ? (
                <img
                  src={formData.cover_url}
                  alt=""
                  className="h-32 object-cover rounded shadow"
                />
              ) : (
                <div className="h-32 w-24 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs">
                  No Cover
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFindCover}
                disabled={searchingCover || !formData.title}
              >
                {searchingCover ? "Searching..." : "Find Cover"}
              </Button>

              {/* Cover picker */}
              {showCoverPicker && coverOptions.length > 0 && (
                <div className="w-full mt-2">
                  <p className="text-xs text-muted-foreground mb-2 text-center">
                    Select a cover ({coverOptions.length} options)
                  </p>
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                    {coverOptions.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => selectCover(url)}
                        className={`border-2 rounded overflow-hidden hover:border-primary transition-colors ${
                          formData.cover_url === url ? "border-primary" : "border-transparent"
                        }`}
                      >
                        <img
                          src={url}
                          alt={`Cover option ${i + 1}`}
                          className="w-full h-20 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCoverPicker(false)}
                    className="w-full mt-2"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

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
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                className="flex-shrink-0"
              >
                Delete
              </Button>
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Book</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{book?.title}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
