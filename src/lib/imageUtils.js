// src/lib/imageUtils.js
// Canonical utility for resolving + sanitizing product image paths.

export const PLACEHOLDER = "/placeholder.png";

const IMAGE_EXTS = new Set(["webp", "jpg", "jpeg", "png", "gif", "avif"]);

function hasImageExtension(str) {
  const ext = str.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

/**
 * Resolve an image_path value to a safe, displayable URL.
 *
 * Rules:
 *  1. Null / empty / whitespace-only        → PLACEHOLDER (or product-code fallback)
 *  2. Full URL (http/https/data/blob)       → return as-is
 *  3. Absolute path (starts with /)        → return as-is, append .webp if no extension
 *  4. Relative filename                    → sanitise spaces, add .webp if needed, prefix /images/
 */
export function resolveImagePath(rawPath, productCode = null) {
  let raw = typeof rawPath === "string" ? rawPath.trim() : "";
  if (!raw) {
    if (productCode) {
      const clean = String(productCode).replace(/^#/, "").trim().replace(/\s+/g, "_");
      return clean ? `/images/${clean}.webp` : PLACEHOLDER;
    }
    return PLACEHOLDER;
  }

  // Normalize windows backslashes
  raw = raw.replace(/\\/g, "/");

  // Full URL or data/blob
  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:")
  ) {
    return raw;
  }

  // Root-relative path that is not an images folder path (e.g. /placeholder.png, /favicon.ico)
  if (raw.startsWith("/") && !/^\/?images\//i.test(raw)) {
    return hasImageExtension(raw) ? raw : `${raw}.webp`;
  }

  // Strip any leading /images/ or images/ prefix
  const stripped = raw.replace(/^\/?images\//i, "");

  // Replace spaces with underscores
  let sanitized = stripped.replace(/\s+/g, "_");
  if (!hasImageExtension(sanitized)) {
    sanitized += ".webp";
  }

  return `/images/${sanitized}`;
}

/**
 * React onError handler — falls back to /placeholder.png with loop protection.
 * Usage: <img src={src} onError={imgOnError} />
 */
export function imgOnError(e) {
  const placeholder = window.location.origin + PLACEHOLDER;
  if (e.target.src !== placeholder) {
    e.target.src = PLACEHOLDER;
  }
}
