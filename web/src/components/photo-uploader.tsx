"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthHeaders } from "@/lib/authHeaders";
import { compressImage, isValidImageType, formatFileSize } from "@/lib/image-compression";
import { cn } from "@/lib/utils";

export type PhotoUploaderProps = {
  date: string;
  metricId?: string;
  onUploadComplete?: (photo: UploadedPhoto) => void;
  onError?: (error: string) => void;
  className?: string;
};

export type UploadedPhoto = {
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
};

export function PhotoUploader({
  date,
  metricId,
  onUploadComplete,
  onError,
  className,
}: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!isValidImageType(file)) {
        onError?.("Invalid file type. Please upload an image.");
        return;
      }

      setUploading(true);
      setProgress("Compressing...");

      try {
        // Compress the image
        const { blob, width, height } = await compressImage(file, {
          maxWidth: 1920,
          maxHeight: 1920,
          maxSizeBytes: 1024 * 1024, // 1MB
        });

        setProgress(`Uploading (${formatFileSize(blob.size)})...`);

        // Create form data
        const formData = new FormData();
        formData.append("file", blob, file.name);
        formData.append("date", date);
        formData.append("width", String(width));
        formData.append("height", String(height));
        if (metricId) {
          formData.append("metric_id", metricId);
        }

        const headers = await getAuthHeaders();
        // Remove Content-Type header since FormData sets it automatically
        delete (headers as Record<string, string>)["Content-Type"];

        const res = await fetch("/api/photos/upload", {
          method: "POST",
          headers,
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Upload failed");
        }

        onUploadComplete?.(data.photo);
        setProgress(null);
      } catch (e) {
        onError?.(e instanceof Error ? e.message : "Upload failed");
        setProgress(null);
      } finally {
        setUploading(false);
      }
    },
    [date, metricId, onUploadComplete, onError]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleUpload(file);
      }
      // Reset input
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [handleUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
        className
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />

      {uploading ? (
        <div className="py-4">
          <div className="text-sm text-muted-foreground">{progress}</div>
        </div>
      ) : (
        <div className="py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Add Photo
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            or drag and drop an image here
          </p>
        </div>
      )}
    </div>
  );
}
