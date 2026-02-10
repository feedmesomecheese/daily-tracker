"use client";

import { Card, CardContent } from "@/components/ui/card";

export type Book = {
  id: string;
  title: string;
  author: string;
  pages: number | null;
  genre: string | null;
  cover_url: string | null;
  open_library_key: string | null;
  format: "physical" | "ebook" | "audio" | null;
  source: "owned" | "library" | null;
  status: "to_read" | "reading" | "completed" | "dnf";
  priority: number | null;
  added_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  notes: string | null;
  would_reread: boolean;
  reading_number: number;
  created_at: string;
  updated_at: string;
  time_to_read: number | null;
};

type BookCardProps = {
  book: Book;
  onClick?: () => void;
};

const formatLabels: Record<string, string> = {
  physical: "Physical",
  ebook: "eBook",
  audio: "Audio",
};

const statusLabels: Record<string, string> = {
  to_read: "To Read",
  reading: "Reading",
  completed: "Completed",
  dnf: "DNF",
};

const statusColors: Record<string, string> = {
  to_read: "bg-gray-100 text-gray-700",
  reading: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  dnf: "bg-red-100 text-red-700",
};

export function BookCard({ book, onClick }: BookCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
      onClick={onClick}
    >
      <CardContent className="p-0 flex">
        {/* Cover image */}
        <div className="w-16 h-24 sm:w-20 sm:h-28 flex-shrink-0 bg-muted">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={`Cover of ${book.title}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-1">
              No Cover
            </div>
          )}
        </div>

        {/* Book details */}
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm leading-tight truncate" title={book.title}>
                {book.title}
                {book.reading_number > 1 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (#{book.reading_number})
                  </span>
                )}
              </h3>
              <p className="text-xs text-muted-foreground truncate">{book.author}</p>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${statusColors[book.status]}`}
            >
              {statusLabels[book.status]}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {book.pages && <span>{book.pages} pages</span>}
            {book.format && <span>{formatLabels[book.format]}</span>}
            {book.rating != null && (
              <span className="font-medium text-foreground">{book.rating}/10</span>
            )}
          </div>

          {book.genre && (
            <p className="mt-1 text-xs text-muted-foreground truncate">{book.genre}</p>
          )}

          {/* Show appropriate date based on status */}
          {book.status === "completed" && book.finished_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Finished: {new Date(book.finished_at).toLocaleDateString()}
              {book.time_to_read != null && book.time_to_read > 0 && (
                <span className="ml-2">({book.time_to_read} days)</span>
              )}
            </p>
          )}
          {book.status === "reading" && book.started_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Started: {new Date(book.started_at).toLocaleDateString()}
            </p>
          )}
          {book.status === "to_read" && book.added_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Added: {new Date(book.added_at).toLocaleDateString()}
            </p>
          )}
          {book.would_reread && book.status === "completed" && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              Would Reread
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function BookCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0 flex">
        <div className="w-16 h-24 sm:w-20 sm:h-28 flex-shrink-0 bg-muted animate-pulse" />
        <div className="flex-1 p-3 space-y-2">
          <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
          <div className="h-3 bg-muted rounded animate-pulse w-1/4" />
        </div>
      </CardContent>
    </Card>
  );
}
