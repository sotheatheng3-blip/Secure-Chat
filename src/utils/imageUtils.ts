/**
 * Utility functions for image processing, compression, and Google Drive URL normalization
 */

/**
 * Resizes and compresses an image file on the client before upload/storing.
 * Prevents huge payloads from slowing down networks or hitting payload limits.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image data"));
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({
            dataUrl: e.target?.result as string,
            blob: file,
            width: img.width,
            height: img.height
          });
          return;
        }

        // High quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Prefer image/webp or fallback to image/jpeg / image/png
        const outputMime = file.type === "image/png" ? "image/png" : "image/jpeg";
        const dataUrl = canvas.toDataURL(outputMime, quality);

        canvas.toBlob(
          (blob) => {
            resolve({
              dataUrl,
              blob: blob || file,
              width,
              height
            });
          },
          outputMime,
          quality
        );
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Resizes and compresses an avatar image to a compact square (max 384x384, ~30-50KB)
 */
export async function compressAvatarFile(file: File): Promise<string> {
  const result = await compressImageFile(file, 384, 384, 0.82);
  return result.dataUrl;
}

/**
 * Extracts a Google Drive file ID from various Google Drive URL patterns
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url || typeof url !== "string") return null;

  // Patterns:
  // 1. https://drive.google.com/file/d/FILE_ID/view...
  // 2. https://drive.google.com/uc?id=FILE_ID...
  // 3. https://drive.google.com/open?id=FILE_ID...
  // 4. https://lh3.googleusercontent.com/d/FILE_ID...
  // 5. https://drive.google.com/thumbnail?id=FILE_ID...
  const matchFileD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileD && matchFileD[1]) return matchFileD[1];

  const matchIdParam = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchIdParam && matchIdParam[1]) return matchIdParam[1];

  const matchLh3 = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (matchLh3 && matchLh3[1]) return matchLh3[1];

  return null;
}

/**
 * Converts any Google Drive or cloud URL into the most reliable direct image display URL
 */
export function normalizeMediaUrl(url?: string): string {
  if (!url) return "";
  const trimmed = url.trim();

  // If it's already a Data URI or blob URI or normal image link
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  // If it's a Google Drive link, convert to direct lh3 CDN link or thumbnail
  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  }

  return trimmed;
}

/**
 * Returns fallback Google Drive thumbnail URL in case primary direct link fails
 */
export function getDriveThumbnailUrl(url: string, size = 1000): string {
  const driveId = extractGoogleDriveFileId(url);
  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}`;
  }
  return url;
}

/**
 * Checks if a message content or URL represents an image
 */
export function isImageContent(
  content?: string,
  mediaType?: string,
  fileName?: string
): boolean {
  if (mediaType && mediaType.toLowerCase().startsWith("image/")) return true;
  if (fileName && /\.(png|jpe?g|gif|webp|svg|bmp|ico|heic|avif)$/i.test(fileName)) return true;
  
  if (!content) return false;
  const str = content.trim();

  if (str.startsWith("data:image/")) return true;
  if (extractGoogleDriveFileId(str)) return true;
  if (/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico|heic|avif))(?:\?.*)?$/i.test(str)) return true;

  return false;
}
