// src/lib/products.js
// Hybrid data layer — uses Supabase if configured, otherwise reads/writes public/products.json
// Safe to run on Vercel and locally.

import fs from "fs";
import path from "path";
import nodePath from "path";
import { supabase, supabaseAdmin } from "./supabase";

const DATA_PATH = path.join(process.cwd(), "public", "products.json");

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
  // Strip out file extensions BEFORE running regex pattern matching
  let str = nodePath.parse(filename).name.trim();

  // Remove commas inside numeric values (e.g. "$13,500" -> "$13500")
  str = str.replace(/(\d+),(\d{3})/g, "$1$2");

  // 2. PRODUCT CODE REGEX
  // Match explicit code patterns starting with '#' containing alphanumeric characters, hyphens, or periods
  let code = null;
  const hashMatch = str.match(/#([A-Za-z0-9.\-]+)/);
  if (hashMatch) {
    code = hashMatch[1];
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
    // Standalone numbers not attached to unit measurements (e.g. 10oz, 5pcs, 3pk, 100ml)
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
        code = part.toUpperCase();
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

// ── Read / Write (Local Fallback) ─────────────────────────────
function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return FALLBACK_PRODUCTS;
  }
}

function writeAll(products) {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(products, null, 2), "utf8");
  } catch (e) {
    console.warn("Could not write products.json:", e.message);
  }
}

// ── CRUD ──────────────────────────────────────────────────────
export async function getAllProducts() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("id", { ascending: true });
      if (!error && data) return data;
      console.warn("Supabase fetch failed, using local file:", error?.message);
    } catch (e) {
      console.warn("Supabase fetch exception, using local file:", e.message);
    }
  }
  return readAll();
}

export async function getProduct(id) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!error && data) return data;
      console.warn(`Supabase fetch product ${id} failed, using local:`, error?.message);
    } catch (e) {
      console.warn(`Supabase fetch product ${id} exception, using local:`, e.message);
    }
  }
  return readAll().find(p => String(p.id) === String(id)) || null;
}

export async function addProduct(data) {
  const client = supabaseAdmin || supabase;
  const category = data.category || detectCategory((data.name || "") + " " + (data.image_path || ""));
  const basePrice = data.base_price ? Number(data.base_price) : null;
  const price = (data.price && data.price !== "EDIT_ME")
    ? Number(data.price)
    : (basePrice ? applyMarkup(basePrice, category) : 0);

  const colors = Array.isArray(data.colors) ? data.colors : [];
  const sizes = Array.isArray(data.sizes) ? data.sizes : [];
  const images = Array.isArray(data.images) ? data.images : (data.image_path ? [data.image_path] : []);
  const showColorSelector = typeof data.showColorSelector === "boolean" ? data.showColorSelector : (colors.length > 0);
  const showSizeSelector = typeof data.showSizeSelector === "boolean" ? data.showSizeSelector : (sizes.length > 0);

  if (client) {
    try {
      if (data.product_code) {
        const { data: existing, error: findError } = await client
          .from("products")
          .select("*")
          .eq("product_code", data.product_code)
          .maybeSingle();
        if (!findError && existing) {
          // Merge logic
          const existingImages = existing.images || (existing.image_path ? [existing.image_path] : []);
          const mergedImages = Array.from(new Set([...existingImages, ...images]));
          const existingColors = existing.colors || [];
          const newColors = colors.filter(nc => !existingColors.some(ec => ec.name.toLowerCase() === nc.name.toLowerCase()));
          const mergedColors = [...existingColors, ...newColors];
          const mergedSizes = Array.from(new Set([...(existing.sizes || []), ...sizes]));
          
          const mergedPatch = {
            images: mergedImages,
            colors: mergedColors,
            sizes: mergedSizes,
            showColorSelector: typeof data.showColorSelector === "boolean" ? data.showColorSelector : (existing.showColorSelector ?? (mergedColors.length > 0)),
            showSizeSelector: typeof data.showSizeSelector === "boolean" ? data.showSizeSelector : (existing.showSizeSelector ?? (mergedSizes.length > 0)),
          };
          const { data: updated } = await client.from("products").update(mergedPatch).eq("id", existing.id).select().single();
          if (updated) return updated;
        }
      }

      const payload = {
        name: data.name || "New Product",
        product_code: data.product_code || `PROD-${Date.now()}`,
        price,
        base_price: basePrice,
        category,
        image_path: data.image_path || images[0] || "",
        images,
        colors,
        sizes,
        showColorSelector,
        showSizeSelector,
        in_stock: data.in_stock ?? true,
        featured: data.featured ?? false,
        source: data.source || "manual",
        description: data.description || null,
      };

      const { data: inserted, error } = await client
        .from("products")
        .insert(payload)
        .select()
        .single();

      if (!error && inserted) return inserted;
      console.warn("Supabase insert failed, using local fallback:", error?.message);
    } catch (e) {
      console.warn("Supabase insert exception, using local fallback:", e.message);
    }
  }

  // Local JSON fallback
  const products = readAll();
  if (data.product_code) {
    const existingIdx = products.findIndex(p => p.product_code === data.product_code);
    if (existingIdx !== -1) {
      const existing = products[existingIdx];
      const existingImages = existing.images || (existing.image_path ? [existing.image_path] : []);
      const mergedImages = Array.from(new Set([...existingImages, ...images]));
      const existingColors = existing.colors || [];
      const newColors = colors.filter(nc => !existingColors.some(ec => ec.name.toLowerCase() === nc.name.toLowerCase()));
      const mergedColors = [...existingColors, ...newColors];
      const mergedSizes = Array.from(new Set([...(existing.sizes || []), ...sizes]));
      products[existingIdx] = {
        ...existing,
        images: mergedImages,
        colors: mergedColors,
        sizes: mergedSizes,
        showColorSelector: typeof data.showColorSelector === "boolean" ? data.showColorSelector : (existing.showColorSelector ?? (mergedColors.length > 0)),
        showSizeSelector: typeof data.showSizeSelector === "boolean" ? data.showSizeSelector : (existing.showSizeSelector ?? (mergedSizes.length > 0)),
      };
      writeAll(products);
      return products[existingIdx];
    }
  }

  const nextId = products.length ? Math.max(...products.map(p => Number(p.id))) + 1 : 1;
  const product = {
    id: nextId,
    name: data.name || "New Product",
    product_code: data.product_code || `PROD-${String(nextId).padStart(4, "0")}`,
    price,
    base_price: basePrice,
    category,
    image_path: data.image_path || images[0] || "",
    images,
    colors,
    sizes,
    showColorSelector,
    showSizeSelector,
    in_stock: data.in_stock ?? true,
    featured: data.featured ?? false,
    source: data.source || "manual",
    description: data.description || null,
  };

  writeAll([...products, product]);
  return product;
}

export async function updateProduct(id, patch) {
  const client = supabaseAdmin || supabase;
  if (client) {
    try {
      const { id: _id, created_at: _ca, updated_at: _ua, ...safe } = patch;
      if (safe.base_price && !safe.price) {
        safe.price = applyMarkup(Number(safe.base_price), safe.category || "Accessories");
      }
      const { data: updated, error } = await client
        .from("products")
        .update(safe)
        .eq("id", id)
        .select()
        .single();

      if (!error && updated) return updated;
      console.warn(`Supabase update product ${id} failed, using local:`, error?.message);
    } catch (e) {
      console.warn(`Supabase update product ${id} exception, using local:`, e.message);
    }
  }

  // Local JSON fallback
  const products = readAll();
  const idx = products.findIndex(p => String(p.id) === String(id));
  if (idx === -1) return null;
  const { id: _id, created_at: _ca, ...safe } = patch;
  if (safe.base_price && !safe.price) {
    safe.price = applyMarkup(Number(safe.base_price), safe.category || products[idx].category);
  }
  products[idx] = { ...products[idx], ...safe };
  writeAll(products);
  return products[idx];
}

export async function deleteProduct(id) {
  const client = supabaseAdmin || supabase;
  if (client) {
    try {
      const { error } = await client
        .from("products")
        .delete()
        .eq("id", id);
      if (!error) return;
      console.warn(`Supabase delete product ${id} failed, using local:`, error?.message);
    } catch (e) {
      console.warn(`Supabase delete product ${id} exception, using local:`, e.message);
    }
  }

  // Local JSON fallback
  const products = readAll().filter(p => String(p.id) !== String(id));
  writeAll(products);
}

export async function mergeFromCsv(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length <= 1) return readAll();
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.replace(/"/g, "").trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });

  const client = supabaseAdmin || supabase;
  if (client) {
    try {
      const results = [];
      for (const r of rows) {
        if (!r.product_code) continue;
        const name = r.name || "Unnamed";
        const base_price = r.base_price ? Number(r.base_price) : null;
        const category = r.category || "Accessories";
        const price = r.price ? Number(r.price) : (base_price ? applyMarkup(base_price, category) : 0);

        const payload = {
          name,
          product_code: r.product_code,
          price,
          base_price,
          category,
          image_path: r.image_path || "",
          in_stock: r.in_stock !== "false",
          featured: r.featured === "true",
          source: r.source || "csv",
          description: r.description || null,
        };

        const { data: existing } = await client
          .from("products")
          .select("id")
          .eq("product_code", r.product_code)
          .maybeSingle();

        if (existing) {
          const { data: updated } = await client
            .from("products")
            .update(payload)
            .eq("id", existing.id)
            .select()
            .single();
          if (updated) results.push(updated);
        } else {
          const { data: inserted } = await client
            .from("products")
            .insert(payload)
            .select()
            .single();
          if (inserted) results.push(inserted);
        }
      }
      const { data: all } = await client.from("products").select("*").order("id", { ascending: true });
      if (all) return all;
    } catch (e) {
      console.warn("Supabase CSV merge exception, using local:", e.message);
    }
  }

  // Local JSON fallback
  const products = readAll();
  const existingCodes = new Set(products.map(p => p.product_code));
  const merged = [...products];

  for (const r of rows) {
    if (!r.product_code) continue;
    if (existingCodes.has(r.product_code)) {
      const idx = merged.findIndex(p => p.product_code === r.product_code);
      if (idx >= 0) merged[idx] = { ...merged[idx], ...r, in_stock: r.in_stock !== "false" };
    } else {
      merged.push({
        id: merged.length + 1,
        name: r.name || "Unnamed",
        product_code: r.product_code,
        price: r.price ? Number(r.price) : 0,
        base_price: r.base_price ? Number(r.base_price) : null,
        category: r.category || "Accessories",
        image_path: r.image_path || "",
        in_stock: r.in_stock !== "false",
        featured: r.featured === "true",
        source: r.source || "csv",
        description: r.description || null,
      });
      existingCodes.add(r.product_code);
    }
  }

  writeAll(merged);
  return merged;
}

export function exportCsv(products) {
  const h = ["id", "name", "product_code", "price", "base_price", "category", "image_path", "in_stock", "featured", "description"];
  return [h.join(","), ...products.map(p => h.map(k => { const v = String(p[k] ?? ""); return v.includes(",") ? `"${v}"` : v; }).join(","))].join("\n");
}


