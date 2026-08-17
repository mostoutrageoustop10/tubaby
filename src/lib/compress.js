// src/lib/compress.js
// Compresses and converts any uploaded image to WebP using sharp.
// Called by the /api/images upload route before saving to disk.
//
// Rules:
//   - Resize to max 800px on the longest side (preserves aspect ratio)
//   - Convert to WebP at quality 85 (visually lossless, ~70% smaller than JPEG)
//   - If sharp is unavailable (edge runtime etc.), return the original buffer unchanged

import path from "path";

export const COMPRESS_OPTIONS = {
  maxDim:  800,   // px — enough for retina 4-col grid
  quality: 85,    // WebP quality (0–100)
};

/**
 * Compress an image buffer to WebP.
 * @param {Buffer} inputBuffer  - raw image bytes
 * @param {string} filename     - original filename (used to swap extension)
 * @returns {{ buffer: Buffer, filename: string, originalKb: number, compressedKb: number }}
 */
export async function compressImage(inputBuffer, filename) {
  const originalKb = inputBuffer.byteLength / 1024;

  // Swap extension to .webp
  const stem        = path.parse(filename).name;
  const safeStem    = stem.replace(/[^a-zA-Z0-9._-]/g, "_");
  const outFilename = safeStem + ".webp";

  try {
    const sharp = (await import("sharp")).default;

    const buffer = await sharp(inputBuffer)
      .rotate()                                // auto-rotate from EXIF
      .resize(COMPRESS_OPTIONS.maxDim, COMPRESS_OPTIONS.maxDim, {
        fit:           "inside",              // never upscale, preserve aspect ratio
        withoutEnlargement: true,
      })
      .webp({ quality: COMPRESS_OPTIONS.quality })
      .toBuffer();

    const compressedKb = buffer.byteLength / 1024;
    const saving       = ((1 - compressedKb / originalKb) * 100).toFixed(0);

    console.log(
      `[compress] ${filename} → ${outFilename}  ` +
      `${originalKb.toFixed(0)}KB → ${compressedKb.toFixed(0)}KB  (${saving}% smaller)`
    );

    return { buffer, filename: outFilename, originalKb, compressedKb };

  } catch (err) {
    // sharp not available — save original with .webp name anyway
    console.warn("[compress] sharp unavailable, saving original:", err.message);
    return { buffer: inputBuffer, filename: outFilename, originalKb, compressedKb: originalKb };
  }
}
