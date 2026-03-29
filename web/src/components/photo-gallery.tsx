"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { getAuthHeaders } from "@/lib/authHeaders";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

export type Photo = {
  id: string;
  date: string;
  metric_id: string | null;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  url: string;
  created_at: string;
};

export type PhotoGalleryProps = {
  photos: Photo[];
  onDelete?: (photoId: string) => void;
  onSelect?: (photo: Photo) => void;
  className?: string;
  showDelete?: boolean;
};

export function PhotoGallery({
  photos,
  onDelete,
  onSelect,
  className,
  showDelete = true,
}: PhotoGalleryProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast, confirm } = useToast();

  const handleDelete = useCallback(
    async (photoId: string, e: React.MouseEvent) => {
      e.stopPropagation();

      if (!await confirm({ message: "Delete this photo?", destructive: true, confirmLabel: "Delete" })) return;

      setDeletingId(photoId);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/photos?id=${photoId}`, {
          method: "DELETE",
          headers,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Delete failed");
        }

        onDelete?.(photoId);
      } catch (e) {
        console.error("Failed to delete photo:", e);
        toast(e instanceof Error ? e.message : "Failed to delete photo", "error");
      } finally {
        setDeletingId(null);
      }
    },
    [onDelete]
  );

  if (photos.length === 0) {
    return (
      <div className={cn("text-center text-sm text-muted-foreground py-4", className)}>
        No photos yet
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2", className)}>
      {photos.map((photo) => (
        <div
          key={photo.id}
          className={cn(
            "relative aspect-square rounded-lg overflow-hidden bg-muted group",
            onSelect && "cursor-pointer"
          )}
          onClick={() => onSelect?.(photo)}
        >
          <img
            src={photo.url}
            alt={photo.caption || photo.filename}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />

          {/* Overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />

          {/* Delete button */}
          {showDelete && (
            <Button
              variant="destructive"
              size="icon"
              className={cn(
                "absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                deletingId === photo.id && "opacity-100"
              )}
              onClick={(e) => handleDelete(photo.id, e)}
              disabled={deletingId === photo.id}
            >
              {deletingId === photo.id ? "..." : "×"}
            </Button>
          )}

          {/* Caption */}
          {photo.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate">
              {photo.caption}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
