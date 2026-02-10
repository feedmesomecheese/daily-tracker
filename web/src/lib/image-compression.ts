/**
 * Client-side image compression utilities
 */

export type CompressionOptions = {
  maxWidth?: number;
  maxHeight?: number;
  maxSizeBytes?: number;
  quality?: number;
  outputType?: "image/jpeg" | "image/png" | "image/webp";
};

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  maxSizeBytes: 1024 * 1024, // 1MB
  quality: 0.85,
  outputType: "image/jpeg",
};

/**
 * Compress an image file using canvas
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<{ blob: Blob; width: number; height: number }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate dimensions
      let { width, height } = img;
      const aspectRatio = width / height;

      if (width > opts.maxWidth) {
        width = opts.maxWidth;
        height = width / aspectRatio;
      }

      if (height > opts.maxHeight) {
        height = opts.maxHeight;
        width = height * aspectRatio;
      }

      width = Math.round(width);
      height = Math.round(height);

      // Create canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels to meet size constraint
      let quality = opts.quality;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to compress image"));
              return;
            }

            // If still too large and quality can be reduced, try again
            if (blob.size > opts.maxSizeBytes && quality > 0.1) {
              quality -= 0.1;
              tryCompress();
              return;
            }

            resolve({ blob, width, height });
          },
          opts.outputType,
          quality
        );
      };

      tryCompress();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Generate a thumbnail from an image
 */
export async function generateThumbnail(
  file: File,
  maxSize: number = 200
): Promise<{ blob: Blob; width: number; height: number }> {
  return compressImage(file, {
    maxWidth: maxSize,
    maxHeight: maxSize,
    quality: 0.7,
    outputType: "image/jpeg",
  });
}

/**
 * Get image dimensions without loading the full image
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Check if a file is a valid image type
 */
export function isValidImageType(file: File): boolean {
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"];
  return validTypes.includes(file.type);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
