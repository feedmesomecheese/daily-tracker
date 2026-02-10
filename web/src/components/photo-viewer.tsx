"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthHeaders } from "@/lib/authHeaders";
import type { Photo } from "@/components/photo-gallery";

export type PhotoViewerProps = {
  photo: Photo | null;
  photos?: Photo[];
  onClose: () => void;
  onDelete?: (photoId: string) => void;
  onCaptionUpdate?: (photoId: string, caption: string) => void;
};

export function PhotoViewer({
  photo,
  photos = [],
  onClose,
  onDelete,
  onCaptionUpdate,
}: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const currentPhoto = photos.length > 0 ? photos[currentIndex] : photo;

  // Update current index when photo changes
  useEffect(() => {
    if (photo && photos.length > 0) {
      const index = photos.findIndex((p) => p.id === photo.id);
      if (index >= 0) setCurrentIndex(index);
    }
  }, [photo, photos]);

  // Update caption when photo changes
  useEffect(() => {
    setCaption(currentPhoto?.caption || "");
  }, [currentPhoto]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentPhoto) return;

      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          if (photos.length > 0 && currentIndex > 0) {
            setCurrentIndex((i) => i - 1);
          }
          break;
        case "ArrowRight":
          if (photos.length > 0 && currentIndex < photos.length - 1) {
            setCurrentIndex((i) => i + 1);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPhoto, currentIndex, photos.length, onClose]);

  const handleSaveCaption = useCallback(async () => {
    if (!currentPhoto) return;

    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/photos", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentPhoto.id, caption }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save caption");
      }

      onCaptionUpdate?.(currentPhoto.id, caption);
    } catch (e) {
      console.error("Failed to save caption:", e);
      alert(e instanceof Error ? e.message : "Failed to save caption");
    } finally {
      setSaving(false);
    }
  }, [currentPhoto, caption, onCaptionUpdate]);

  const handleDelete = useCallback(async () => {
    if (!currentPhoto) return;
    if (!confirm("Delete this photo?")) return;

    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/photos?id=${currentPhoto.id}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }

      onDelete?.(currentPhoto.id);

      // Navigate to next/prev or close
      if (photos.length <= 1) {
        onClose();
      } else if (currentIndex >= photos.length - 1) {
        setCurrentIndex((i) => i - 1);
      }
    } catch (e) {
      console.error("Failed to delete photo:", e);
      alert(e instanceof Error ? e.message : "Failed to delete photo");
    } finally {
      setDeleting(false);
    }
  }, [currentPhoto, currentIndex, photos.length, onDelete, onClose]);

  if (!currentPhoto) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 bg-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white text-sm">
          {currentPhoto.filename}
          {photos.length > 1 && (
            <span className="text-white/60 ml-2">
              {currentIndex + 1} / {photos.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:text-red-400"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
          <Button variant="ghost" size="sm" className="text-white" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center p-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous button */}
        {photos.length > 1 && currentIndex > 0 && (
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-white/80"
            onClick={() => setCurrentIndex((i) => i - 1)}
          >
            &larr;
          </button>
        )}

        <img
          src={currentPhoto.url}
          alt={currentPhoto.caption || currentPhoto.filename}
          className="max-w-full max-h-full object-contain"
        />

        {/* Next button */}
        {photos.length > 1 && currentIndex < photos.length - 1 && (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-white/80"
            onClick={() => setCurrentIndex((i) => i + 1)}
          >
            &rarr;
          </button>
        )}
      </div>

      {/* Footer - Caption editor */}
      <div
        className="p-4 bg-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 max-w-xl mx-auto">
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption..."
            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40"
            onKeyDown={(e) => e.key === "Enter" && handleSaveCaption()}
          />
          <Button
            size="sm"
            onClick={handleSaveCaption}
            disabled={saving || caption === (currentPhoto.caption || "")}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
        <div className="text-center text-white/40 text-xs mt-2">
          {currentPhoto.date} &bull; {Math.round(currentPhoto.size_bytes / 1024)} KB
          {currentPhoto.width && currentPhoto.height && (
            <> &bull; {currentPhoto.width} × {currentPhoto.height}</>
          )}
        </div>
      </div>
    </div>
  );
}
