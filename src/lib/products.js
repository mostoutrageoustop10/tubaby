// src/lib/products.js
import nodePath from "path";
import { supabase, supabaseAdmin } from "./supabase.js";
import {
  applyMarkup,
  detectCategory,
  parseResilientInput,
} from "./product-shared.js";
import { resolveImagePath } from "./imageUtils.js";


export {
  MARKUP,
  applyMarkup,
  detectCategory,
  suggestBundles,
  parseResilientInput,
  FALLBACK_PRODUCTS
} from "./product-shared.js";

export function extractFromFilename(filename) {
  if (!filename) return { name: "Product", code: null, basePrice: null };

  // 1. STRING SANITIZATION FIRST
  let str = nodePath.parse(filename).name.trim();

  // Remove commas inside numeric values (e.g. "$13,500" -> "$13500")
  str = str.replace(/(\d+),(\d{3})/g, "$1$2");

  // 2. PRODUCT CODE REGEX
  let code = null;
  const hashMatch = str.match(/#([A-Za-z0-9.\-]+)/);
  if (hashMatch) {
    code = `#${hashMatch[1]}`;
  }

  // Remove the #code token first so numbers attached to # are NEVER treated as price!
  const textWithoutHash = str.replace(/#([A-Za-z0-9.\-]+)/g, "");

  // 3. PRICE REGEX
  let basePrice = null;
  const dollarMatch = textWithoutHash.match(/\$(\d+(?:\.\d+)?)/);
  const jmdMatch = textWithoutHash.match(/(?:JMD\s*)(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*JMD/i);

  if (dollarMatch) {
    basePrice = parseFloat(dollarMatch[1]);
  } else if (jmdMatch) {
    basePrice = parseFloat(jmdMatch[1] || jmdMatch[2]);
  } else {
    const numberMatch = textWithoutHash.match(/(?:^|[\s_\/\-])(\d{2,6})(?!\s*(?:oz|pcs|pk|pack|ml|g|kg|m|cm|mm|in)\b)(?:[\s_\/\.\-]|$)/i);
    if (numberMatch) {
      basePrice = parseFloat(numberMatch[1]);
    }
  }

  // Fallback check for capital alphanumeric code (like EN71-2) ONLY if no # symbol was present
  if (!code) {
    const parts = str.split(/_+/).filter(Boolean);
    for (const part of parts) {
      if (/^[A-Z0-9][A-Z0-9-]+$/i.test(part) && /[A-Za-z]/.test(part) && /\d/.test(part)) {
        code = `#${part.toUpperCase()}`;
        break;
      }
    }
  }

  // 4. CLEAN TITLE:
  let name = str
    .replace(/#([A-Za-z0-9.\-]+)/gi, "")
    .replace(/\$\d+(?:\.\d+)?/gi, "")
    .replace(/(?:JMD\s*)\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*JMD/gi, "")
    .replace(/__+/g, " ")
    .replace(/[-_]+/g, " ")
    .trim();

  if (basePrice && !dollarMatch && !jmdMatch) {
    const priceStr = String(basePrice);
    name = name.replace(new RegExp(`(?:^|\\s)${priceStr}(?:\\s|$)`, "g"), " ").trim();
  }

  name = name
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .trim();

  return { name: name || "Product", code, basePrice };
}

function getClient() {
  const client = supabaseAdmin || supabase;
  if (!client) {
    throw new Error("Supabase client is not configured. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
  }
  return client;
}

export function toUuid(seed) {
  if (typeof seed === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seed)) {
    return seed;
  }
  let str = String(seed || "");
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x811c9dc5, h4 = 0x67452301;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822507);
    h4 = Math.imul(h4 ^ ch, 3266489909);
  }
  const toHex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  const hex = toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const COLOR_HEX_MAP = {
  pink: "#f472b6",
  rose: "#fb7185",
  red: "#ef4444",
  blue: "#60a5fa",
  teal: "#2dd4bf",
  green: "#4ade80",
  yellow: "#facc15",
  orange: "#fb923c",
  purple: "#c084fc",
  white: "#f9fafb",
  black: "#1f2937",
  grey: "#9ca3af",
  gray: "#9ca3af",
  brown: "#a16207",
  beige: "#f5f5dc",
  navy: "#1e3a8a",
  cream: "#fffdd0",
};

function resolveColorHex(name) {
  if (!name || typeof name !== "string") return "#d1d5db";
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(COLOR_HEX_MAP)) {
    if (lower.includes(k)) return v;
  }
  return "#e2e8f0";
}

function normalizeColorsList(rawColors, variants) {
  const v = variants;
  const isObjectVariant = v && typeof v === "object" && !Array.isArray(v);
  const src = (rawColors && (Array.isArray(rawColors) ? rawColors.length > 0 : String(rawColors).trim()))
    ? rawColors
    : (isObjectVariant && Array.isArray(v?.colors) ? v.colors : (Array.isArray(v) ? v : []));

  if (Array.isArray(src)) {
    return src.map(c => {
      if (typeof c === "string") {
        const trimmed = c.trim();
        return { name: trimmed, hex: resolveColorHex(trimmed), inStock: true };
      }
      if (c && typeof c === "object") {
        const name = c.name || c.color || c.label || "Option";
        return {
          name,
          hex: c.hex || resolveColorHex(name),
          inStock: c.inStock !== false
        };
      }
      return null;
    }).filter(Boolean);
  }

  if (typeof src === "string") {
    return src.split(",").map(s => s.trim()).filter(Boolean).map(name => ({
      name,
      hex: resolveColorHex(name),
      inStock: true
    }));
  }

  return [];
}

export const PRODUCT_COLUMNS = "id, name, price, code, category, description, slug, colors, meta_title, image_url, in_stock, needs_review, created_at, variants";
export const PRODUCT_COLUMNS_FALLBACK = "id, name, price, code, category, description, slug, meta_title, image_url, in_stock, needs_review, created_at, variants";

function normalizeProduct(item) {
  if (!item) return null;
  const v = item.variants;
  const isObjectVariant = v && typeof v === "object" && !Array.isArray(v);

  const colors = normalizeColorsList(item.colors, v);
  const sizes = isObjectVariant && Array.isArray(v.sizes) ? v.sizes : (item.sizes || []);
  const showColorSelector = isObjectVariant && typeof v.showColorSelector === "boolean" ? v.showColorSelector : (item.showColorSelector ?? (colors.length > 0));
  const showSizeSelector = isObjectVariant && typeof v.showSizeSelector === "boolean" ? v.showSizeSelector : (item.showSizeSelector ?? (sizes.length > 0));
  const in_stock = isObjectVariant && typeof v.in_stock === "boolean" ? v.in_stock : (item.in_stock !== undefined ? Boolean(item.in_stock) : true);
  const featured = isObjectVariant && typeof v.featured === "boolean" ? v.featured : Boolean(item.featured);
  const images = isObjectVariant && Array.isArray(v.images) ? v.images : (Array.isArray(item.images) ? item.images : (item.image_url || item.image_path ? [item.image_url || item.image_path] : []));
  const base_price = isObjectVariant && v.base_price !== undefined ? v.base_price : (item.base_price ?? null);
  const description = (item.description && typeof item.description === "string" && item.description.trim())
    ? item.description.trim()
    : (isObjectVariant && v.description ? v.description : null);

  const image = resolveImagePath(
    item.image_url || item.image_path || item.image,
    item.code || item.product_code
  );
  const code = item.code || item.product_code || "";

  const slug = item.slug || (item.name ? item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : String(item.id || ""));
  const meta_title = (item.meta_title && typeof item.meta_title === "string" && item.meta_title.trim())
    ? item.meta_title.trim()
    : (item.name ? `${item.name} | TiiBaby Shop Jamaica` : null);

  return {
    ...item,
    id: item.id,
    name: item.name || "Unnamed Product",
    product_code: code,
    code: code,
    slug,
    price: Number(item.price) || 0,
    base_price,
    category: item.category || "Accessories",
    image_path: image,
    image: image,
    image_url: image,
    in_stock,
    featured,
    colors,
    sizes,
    showColorSelector,
    showSizeSelector,
    images,
    description,
    meta_title,
    needs_review: Boolean(item.needs_review),
    variants: v || []
  };
}

// ── CRUD Operations directly against Supabase ─────────────────
export async function getAllProducts() {
  const client = getClient();
  let { data, error } = await client
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("created_at", { ascending: true });

  if (error && error.code === "42703") {
    // Retry without colors column if not present in schema cache
    const retry = await client
      .from("products")
      .select(PRODUCT_COLUMNS_FALLBACK)
      .order("created_at", { ascending: true });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(`Supabase fetch failed: ${error.message}`);
  }
  return (data || []).map(normalizeProduct);
}

export async function getProduct(identifier) {
  if (!identifier) return null;
  const client = getClient();
  const cleanId = String(identifier).trim();
  const uuid = toUuid(cleanId);
  const cleanCode = cleanId.replace(/^#/, "");

  const queryCols = async (cols) => {
    // 1. If valid UUID string, try by id directly
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    if (isUuid) {
      const byId = await client.from("products").select(cols).eq("id", cleanId).maybeSingle();
      if (byId.data) return byId;
    }

    // 2. Try by slug
    const bySlug = await client.from("products").select(cols).eq("slug", cleanId).maybeSingle();
    if (bySlug.data) return bySlug;

    // 3. Try by code or deterministic UUID
    const byCodeOrUuid = await client
      .from("products")
      .select(cols)
      .or(`code.eq.${cleanId},code.eq.${cleanCode},id.eq.${uuid}`)
      .limit(1);

    if (byCodeOrUuid.data && byCodeOrUuid.data.length > 0) {
      return { data: byCodeOrUuid.data[0], error: null };
    }

    // 4. Try by approximate name if slug is not yet populated in DB
    const nameSearch = cleanId.replace(/[-_]+/g, " ").trim();
    if (nameSearch.length >= 3) {
      const byName = await client
        .from("products")
        .select(cols)
        .ilike("name", `%${nameSearch}%`)
        .limit(1);

      if (byName.data && byName.data.length > 0) {
        return { data: byName.data[0], error: null };
      }
    }

    return { data: null, error: byCodeOrUuid.error };
  };

  let { data, error } = await queryCols(PRODUCT_COLUMNS);
  if (error && error.code === "42703") {
    const retry = await queryCols(PRODUCT_COLUMNS_FALLBACK);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(`Supabase fetch product ${cleanId} failed: ${error.message}`);
  }
  return normalizeProduct(data);
}

export async function upsertProduct(product) {
  const client = getClient();
  const parsed = parseResilientInput(product);
  const category = parsed.category || detectCategory((parsed.name || "") + " " + (parsed.image_path || ""));
  const basePrice = parsed.base_price ? Number(parsed.base_price) : null;
  const price = (parsed.price !== undefined && parsed.price !== null && parsed.price !== "EDIT_ME")
    ? Number(parsed.price)
    : (basePrice ? applyMarkup(basePrice, category) : 0);

  let code = parsed.product_code || product.code || `#PROD-${Date.now().toString().slice(-6)}`;
  if (!code.startsWith("#")) {
    code = `#${code}`;
  }

  const id = toUuid(product.id || code);
  const image = resolveImagePath(
    product.image_path || product.image_url || product.image,
    code
  );

  const variantsData = {
    colors: product.colors || [],
    sizes: product.sizes || [],
    showColorSelector: typeof product.showColorSelector === "boolean" ? product.showColorSelector : ((product.colors || []).length > 0),
    showSizeSelector: typeof product.showSizeSelector === "boolean" ? product.showSizeSelector : ((product.sizes || []).length > 0),
    in_stock: product.in_stock !== undefined ? Boolean(product.in_stock) : true,
    featured: Boolean(product.featured),
    base_price: basePrice,
    images: Array.isArray(product.images) && product.images.length > 0 ? product.images : [image],
    description: product.description || null,
  };

  const payload = {
    id,
    name: parsed.name || product.name || "Unnamed Product",
    code,
    price,
    category,
    image_url: image,
    needs_review: Boolean(parsed.needs_review),
    variants: variantsData,
  };

  const { data: upserted, error } = await client
    .from("products")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
  return normalizeProduct(upserted);
}

export async function addProduct(data) {
  return upsertProduct(data);
}

export async function updateProduct(id, patch) {
  const existing = await getProduct(id);
  const merged = { ...(existing || {}), ...patch, id };
  return upsertProduct(merged);
}

export async function deleteProduct(id) {
  const client = getClient();
  const { error } = await client
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase delete product ${id} failed: ${error.message}`);
  }
  return { ok: true };
}

export async function mergeFromCsv(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length <= 1) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });

  const client = getClient();
  const results = [];
  for (const r of rows) {
    if (!r.product_code) continue;
    const code = r.product_code.startsWith("#") ? r.product_code : `#${r.product_code}`;
    const name = r.name || "Unnamed";
    const base_price = r.base_price ? Number(r.base_price) : null;
    const category = r.category || "Accessories";
    const price = r.price ? Number(r.price) : (base_price ? applyMarkup(base_price, category) : 0);

    const payload = {
      name,
      product_code: code,
      price,
      base_price,
      category,
      image_path: resolveImagePath(r.image_path, r.product_code),
      in_stock: r.in_stock !== "false",
      featured: r.featured === "true",
      needs_review: false,
      source: r.source || "csv",
      description: r.description || null,
    };

    const { data: existing } = await client
      .from("products")
      .select("id")
      .eq("product_code", code)
      .maybeSingle();

    if (existing) {
      const { data: updated, error: uErr } = await client
        .from("products")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (uErr) throw new Error(uErr.message);
      if (updated) results.push(updated);
    } else {
      const { data: inserted, error: iErr } = await client
        .from("products")
        .insert(payload)
        .select()
        .single();
      if (iErr) throw new Error(iErr.message);
      if (inserted) results.push(inserted);
    }
  }

  const { data: all, error: fetchErr } = await client.from("products").select("*").order("id", { ascending: true });
  if (fetchErr) throw new Error(fetchErr.message);
  return all || [];
}

export function exportCsv(products) {
  const h = ["id", "name", "product_code", "price", "base_price", "category", "image_path", "in_stock", "featured", "description"];
  return [h.join(","), ...products.map(p => h.map(k => { const v = String(p[k] ?? ""); return v.includes(",") ? `"${v}"` : v; }).join(","))].join("\n");
}



