// src/lib/products.js
import nodePath from "path";
import { supabase, supabaseAdmin } from "./supabase";
import {
  applyMarkup,
  detectCategory,
  parseResilientInput,
} from "./product-shared";
import { resolveImagePath } from "./imageUtils";


export {
  MARKUP,
  applyMarkup,
  detectCategory,
  suggestBundles,
  parseResilientInput,
  FALLBACK_PRODUCTS
} from "./product-shared";

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

function normalizeProduct(item) {
  if (!item) return null;
  const v = item.variants;
  const isObjectVariant = v && typeof v === "object" && !Array.isArray(v);

  const colors = isObjectVariant && Array.isArray(v.colors) ? v.colors : (Array.isArray(v) ? v : (item.colors || []));
  const sizes = isObjectVariant && Array.isArray(v.sizes) ? v.sizes : (item.sizes || []);
  const showColorSelector = isObjectVariant && typeof v.showColorSelector === "boolean" ? v.showColorSelector : (item.showColorSelector ?? (colors.length > 0));
  const showSizeSelector = isObjectVariant && typeof v.showSizeSelector === "boolean" ? v.showSizeSelector : (item.showSizeSelector ?? (sizes.length > 0));
  const in_stock = isObjectVariant && typeof v.in_stock === "boolean" ? v.in_stock : (item.in_stock !== undefined ? Boolean(item.in_stock) : true);
  const featured = isObjectVariant && typeof v.featured === "boolean" ? v.featured : Boolean(item.featured);
  const images = isObjectVariant && Array.isArray(v.images) ? v.images : (Array.isArray(item.images) ? item.images : (item.image_url || item.image_path ? [item.image_url || item.image_path] : []));
  const base_price = isObjectVariant && v.base_price !== undefined ? v.base_price : (item.base_price ?? null);
  const description = isObjectVariant && v.description ? v.description : (item.description || null);

  const image = resolveImagePath(
    item.image_url || item.image_path || item.image,
    item.code || item.product_code
  );
  const code = item.code || item.product_code || "";

  return {
    ...item,
    id: item.id,
    name: item.name || "Unnamed Product",
    product_code: code,
    code: code,
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
    needs_review: Boolean(item.needs_review),
    variants: v || []
  };
}

// ── CRUD Operations directly against Supabase ─────────────────
export async function getAllProducts() {
  const client = getClient();
  const { data, error } = await client
    .from("products")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Supabase fetch failed: ${error.message}`);
  }
  return (data || []).map(normalizeProduct);
}

export async function getProduct(id) {
  const client = getClient();
  const uuid = toUuid(id);
  const { data, error } = await client
    .from("products")
    .select("*")
    .or(`id.eq.${uuid},code.eq.${id}`)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase fetch product ${id} failed: ${error.message}`);
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



