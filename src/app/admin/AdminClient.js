"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { parseResilientInput, detectCategory, applyMarkup } from "@/lib/product-shared";
import { extractFromFilename } from "@/lib/products";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { resolveImagePath, imgOnError } from "@/lib/imageUtils";


const DEFAULT_CATEGORIES = ["Baby Carriers", "Accessories", "Toys & Bouncers", "Nursery & Furniture"];
const DEFAULT_FALLBACK_URL = "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=500&q=80";

const PRESET_SWATCHES = [
  { name: "Soft Pink", hex: "#ffb6c1" },
  { name: "Sky Blue", hex: "#87ceeb" },
  { name: "Mint Green", hex: "#a8e6cf" },
  { name: "Pastel Yellow", hex: "#fff9b1" },
  { name: "Cream", hex: "#fffdd0" },
  { name: "Lavender", hex: "#e6e6fa" },
  { name: "White", hex: "#ffffff" },
  { name: "Black", hex: "#1a1a1a" },
  { name: "Beige", hex: "#f5f5dc" },
  { name: "Navy", hex: "#000080" },
];

const PRESET_SIZE_OPTIONS = [
  "Newborn, 0-3M, 3-6M, 6-12M",
  "0-6M, 6-12M, 12-18M, 18-24M",
  "Small, Medium, Large, XL",
  "One Size Fits All",
];

const CACHE_KEYS = ["edited_products", "catalog_storage", "tiibaby_products", "admin_edited_products", "tiibaby_custom_catalog"];

/**
 * Deterministic UUID generator (client-safe)
 */
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

/**
 * Reads any offline edits or cached catalog stored in localStorage
 */
function getLocalCacheEdits() {
  if (typeof window === "undefined") return {};
  const editsMap = {};
  for (const key of CACHE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          if (item && (item.id || item.product_code || item.code)) {
            const k = String(item.id || item.product_code || item.code);
            editsMap[k] = { ...(editsMap[k] || {}), ...item };
          }
        });
      } else if (typeof parsed === "object" && parsed !== null) {
        Object.entries(parsed).forEach(([k, item]) => {
          if (item && typeof item === "object") {
            editsMap[k] = { ...(editsMap[k] || {}), ...item };
          }
        });
      }
    } catch (e) {
      console.warn(`Could not read localStorage cache key "${key}":`, e);
    }
  }
  return editsMap;
}

/**
 * Persists an edited product to the local backup cache
 */
function updateLocalCache(product) {
  if (typeof window === "undefined" || !product) return;
  try {
    const raw = localStorage.getItem("edited_products");
    const map = raw ? JSON.parse(raw) : {};
    const key = String(product.id || product.product_code || product.code);
    map[key] = product;
    localStorage.setItem("edited_products", JSON.stringify(map));
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }
}

/**
 * Removes a product from the local backup cache
 */
function deleteFromLocalCache(id, code) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("edited_products");
    if (!raw) return;
    const map = JSON.parse(raw);
    if (id && map[id]) delete map[id];
    if (code && map[code]) delete map[code];
    localStorage.setItem("edited_products", JSON.stringify(map));
  } catch (e) {}
}

/**
 * Directly executes an upsert into the Supabase products table
 * Ensures image_path is ALWAYS permanent (never temporary blob:)
 */
async function directUpsertSupabase(product) {
  const client = supabaseAdmin || supabase;
  if (!client) {
    throw new Error("Supabase client is not configured. Please check NEXT_PUBLIC_SUPABASE_URL and key in .env.local.");
  }

  const parsed = parseResilientInput(product);
  const category = parsed.category || product.category || detectCategory((parsed.name || "") + " " + (parsed.image_path || ""));
  const basePrice = parsed.base_price !== undefined && parsed.base_price !== null ? Number(parsed.base_price) : (product.base_price ?? null);
  
  let price = 0;
  if (parsed.price !== undefined && parsed.price !== null && parsed.price !== "EDIT_ME") {
    price = Number(parsed.price);
  } else if (product.price !== undefined && product.price !== null && product.price !== "EDIT_ME") {
    price = Number(product.price);
  } else if (basePrice) {
    price = applyMarkup(basePrice, category) || 0;
  }

  let code = parsed.product_code || product.code || product.product_code || `#PROD-${Date.now().toString().slice(-6)}`;
  if (!code.startsWith("#")) {
    code = `#${code}`;
  }

  const id = toUuid(product.id || code);
  
  // Permanent Image Path Normalization: replace any temporary blob: URLs with permanent relative or storage URL
  let image = product.image_path || product.image_url || product.image || "/placeholder.png";
  if (image.startsWith("blob:")) {
    const cleanFileName = (product.name || "product").replace(/[\$#]/g, "").replace(/\s+/g, "_");
    image = `/images/${cleanFileName}.webp`;
  }

  const colors = Array.isArray(product.colors) ? product.colors : [];
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];

  const variantsData = {
    colors,
    sizes,
    showColorSelector: typeof product.showColorSelector === "boolean" ? product.showColorSelector : (colors.length > 0),
    showSizeSelector: typeof product.showSizeSelector === "boolean" ? product.showSizeSelector : (sizes.length > 0),
    in_stock: product.in_stock !== undefined ? Boolean(product.in_stock) : true,
    featured: Boolean(product.featured),
    base_price: basePrice,
    images: Array.isArray(product.images) && product.images.length > 0 ? product.images.map(img => img.startsWith("blob:") ? image : img) : [image],
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
    throw new Error(`Supabase upsert error: ${error.message}`);
  }

  const v = upserted.variants || {};
  const isObjectVariant = v && typeof v === "object" && !Array.isArray(v);

  const finalProduct = {
    ...upserted,
    id: upserted.id,
    name: upserted.name,
    product_code: upserted.code,
    code: upserted.code,
    price: Number(upserted.price) || 0,
    base_price: isObjectVariant && v.base_price !== undefined ? v.base_price : basePrice,
    category: upserted.category,
    image_path: upserted.image_url || image,
    image: upserted.image_url || image,
    image_url: upserted.image_url || image,
    in_stock: isObjectVariant && typeof v.in_stock === "boolean" ? v.in_stock : (upserted.in_stock !== undefined ? Boolean(upserted.in_stock) : true),
    featured: isObjectVariant && typeof v.featured === "boolean" ? v.featured : Boolean(upserted.featured),
    colors: isObjectVariant && Array.isArray(v.colors) ? v.colors : colors,
    sizes: isObjectVariant && Array.isArray(v.sizes) ? v.sizes : sizes,
    showColorSelector: isObjectVariant && typeof v.showColorSelector === "boolean" ? v.showColorSelector : (colors.length > 0),
    showSizeSelector: isObjectVariant && typeof v.showSizeSelector === "boolean" ? v.showSizeSelector : (sizes.length > 0),
    images: isObjectVariant && Array.isArray(v.images) ? v.images : [upserted.image_url || image],
    description: isObjectVariant && v.description ? v.description : (upserted.description || null),
    needs_review: Boolean(upserted.needs_review),
    variants: upserted.variants || []
  };

  // Sync to local cache backup as well
  updateLocalCache(finalProduct);

  return finalProduct;
}

/**
 * AI Product Ingestion System
 * Unified component combining drag-and-drop, bulk ingestion, and direct Supabase upsert.
 */
function AiProductIngestionSystem({ categories, onProductAdded, onBulkProductsAdded, showFlash }) {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [isBulkIngesting, setIsBulkIngesting] = useState(false);

  // Manual Form States
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualCategory, setManualCategory] = useState(categories[0] || "Accessories");
  const [manualFile, setManualFile] = useState(null);
  const [manualUploading, setManualUploading] = useState(false);

  const fileInputRef = useRef(null);

  // Direct client-side upload & ingestion handler for a single file
  const processSingleFile = async (file, client) => {
    // 1. Clean permanent filename
    const cleanFileName = file.name
      .replace(/[\$#]/g, "")
      .replace(/\s+/g, "_");

    let permanentImagePath = resolveImagePath(`/images/${cleanFileName}`);

    // 2. Upload to Supabase Storage bucket 'product-images'
    try {
      if (client) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const storageFilename = `product-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

        const { error: storageErr } = await client.storage
          .from("product-images")
          .upload(storageFilename, file, {
            contentType: file.type || "image/jpeg",
            upsert: true,
          });

        if (!storageErr) {
          const { data: { publicUrl } } = client.storage
            .from("product-images")
            .getPublicUrl(storageFilename);
          if (publicUrl) {
            permanentImagePath = publicUrl;
          }
        }
      }
    } catch (e) {
      console.warn("Storage upload fallback to permanent relative image path:", e);
    }

    // 3. Parse details strictly using SKU (#) and Price ($) rules
    const extracted = extractFromFilename(file.name);
    const cat = detectCategory(file.name + " " + extracted.name);
    
    // Explicit $ price vs basePrice calculation
    const calculatedPrice = extracted.price || (extracted.basePrice ? applyMarkup(extracted.basePrice, cat) : 0);

    let productCode = extracted.code || `#PROD-${Date.now().toString().slice(-6)}`;
    if (!productCode.startsWith("#")) {
      productCode = `#${productCode}`;
    }

    const productData = {
      name: extracted.name || file.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " "),
      product_code: productCode,
      code: productCode,
      price: calculatedPrice || 0,
      base_price: extracted.basePrice || null,
      category: cat,
      image_path: permanentImagePath,
      image_url: permanentImagePath,
      images: [permanentImagePath],
      in_stock: true,
      featured: false,
      needs_review: calculatedPrice === 0,
      source: "bulk-ingestion",
    };

    // 4. Immediately upsert directly into Supabase
    const saved = await directUpsertSupabase(productData);
    return saved;
  };

  const handleFiles = async (filesList) => {
    const valid = Array.from(filesList).filter(f => f.type.startsWith("image/"));
    if (valid.length === 0) return;

    setIsBulkIngesting(true);
    const client = supabaseAdmin || supabase;

    const initialUploadEntries = valid.map(f => ({
      uid: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      file: f,
      name: f.name,
      status: "uploading",
      product: null,
      error: null
    }));

    setUploads(prev => [...initialUploadEntries, ...prev]);

    let successCount = 0;
    const ingestedProducts = [];

    for (const entry of initialUploadEntries) {
      try {
        const savedProduct = await processSingleFile(entry.file, client);
        successCount++;
        ingestedProducts.push(savedProduct);

        setUploads(prev => prev.map(u => u.uid === entry.uid ? { ...u, status: "done", product: savedProduct } : u));
        onProductAdded(savedProduct);
      } catch (err) {
        console.error(`Ingest error for ${entry.name}:`, err);
        setUploads(prev => prev.map(u => u.uid === entry.uid ? { ...u, status: "error", error: err.message } : u));
      }
    }

    setIsBulkIngesting(false);

    if (successCount > 0) {
      showFlash(`🎉 Successfully ingested & saved ${successCount} product(s) directly to Supabase!`);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualName.trim()) return;

    setManualUploading(true);
    try {
      const client = supabaseAdmin || supabase;
      let permanentImageUrl = DEFAULT_FALLBACK_URL;

      if (manualFile && client) {
        const ext = manualFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const cleanName = manualFile.name.replace(/[\$#]/g, "").replace(/\s+/g, "_");
        const filename = `product-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

        const { error: uploadErr } = await client.storage
          .from("product-images")
          .upload(filename, manualFile, {
            contentType: manualFile.type || "image/jpeg",
            upsert: true,
          });

        if (!uploadErr) {
          const { data: { publicUrl } } = client.storage
            .from("product-images")
            .getPublicUrl(filename);
          permanentImageUrl = publicUrl;
        } else {
          permanentImageUrl = resolveImagePath(`/images/${cleanName}`);
        }
      }

      let formattedCode = manualCode.trim();
      if (formattedCode && !formattedCode.startsWith("#")) {
        formattedCode = `#${formattedCode}`;
      }

      const productData = {
        name: manualName.trim(),
        price: manualPrice,
        product_code: formattedCode || `#PROD-${Date.now().toString().slice(-6)}`,
        category: manualCategory,
        image_path: permanentImageUrl,
        image_url: permanentImageUrl,
        images: [permanentImageUrl],
        in_stock: true,
        featured: false,
        needs_review: false,
        source: "manual-form",
      };

      const created = await directUpsertSupabase(productData);

      onProductAdded(created);
      showFlash(`✨ Created & Saved "${created.name}" (${created.product_code}) directly to Supabase`);

      setManualName("");
      setManualPrice("");
      setManualCode("");
      setManualFile(null);
      setShowManualForm(false);
    } catch (err) {
      showFlash(`❌ Creation failed: ${err.message}`, "error");
    } finally {
      setManualUploading(false);
    }
  };

  const handleRetryAllFailed = async () => {
    const failed = uploads.filter(u => u.status === "error" && u.file);
    if (failed.length === 0) return;

    setIsBulkIngesting(true);
    const client = supabaseAdmin || supabase;

    for (const entry of failed) {
      setUploads(prev => prev.map(u => u.uid === entry.uid ? { ...u, status: "uploading", error: null } : u));
      try {
        const saved = await processSingleFile(entry.file, client);
        setUploads(prev => prev.map(u => u.uid === entry.uid ? { ...u, status: "done", product: saved } : u));
        onProductAdded(saved);
      } catch (err) {
        setUploads(prev => prev.map(u => u.uid === entry.uid ? { ...u, status: "error", error: err.message } : u));
      }
    }
    setIsBulkIngesting(false);
  };

  return (
    <div className="admin-section" style={{ background: "#ffffff", border: "1.5px dashed #cbd5e1", borderRadius: 16, padding: "1.25rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#1e1b2e" }}>
            ⚡ Bulk Image Ingestion & SKU / Price Auto-Sync
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: ".8rem", color: "#64748b" }}>
            Drop single or multiple images. Automatically parses <strong style={{ color: "#d97706" }}>#SKU</strong> and <strong style={{ color: "#059669" }}>$Price</strong>, stores permanent image paths, and upserts straight into Supabase.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowManualForm(s => !s)}
          className="btn btn-outline btn-sm"
          style={{ fontSize: ".8rem" }}
        >
          {showManualForm ? "▲ Hide Manual Form" : "➕ Add Single Product Manually"}
        </button>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "var(--pink)" : "#cbd5e1"}`,
          borderRadius: 12,
          padding: "1.75rem 1rem",
          textAlign: "center",
          background: dragging ? "#fff0f6" : "#f8fafc",
          cursor: "pointer",
          transition: "all .2s ease",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>📁 📸</div>
        <p style={{ fontWeight: 800, margin: "0 0 4px", fontSize: ".95rem", color: "#1e293b" }}>
          Drag & Drop Multiple Product Images Here, or <span style={{ color: "var(--pink)", textDecoration: "underline" }}>Browse Files</span>
        </p>
        <p style={{ margin: 0, fontSize: ".78rem", color: "#64748b" }}>
          Filename format rules: <code>Product Name_#SKU_$Price.jpg</code> (e.g. <code>RAINCOAT_#730_$1387.webp</code> or <code>BABY_CARRIER_#EN71-2_$980.webp</code>)
        </p>
      </div>

      {/* Manual Creation Form */}
      {showManualForm && (
        <form
          onSubmit={handleManualSubmit}
          style={{
            marginTop: "1rem",
            padding: "1.1rem",
            background: "#f1f5f9",
            borderRadius: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: ".75rem",
            alignItems: "end",
          }}
        >
          <div>
            <label style={{ fontSize: ".78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 3 }}>
              Product Name *
            </label>
            <input
              className="admin-input"
              required
              placeholder="e.g. Baby Rocker Swing"
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ fontSize: ".78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 3 }}>
              SKU / Code (#)
            </label>
            <input
              className="admin-input"
              placeholder="e.g. #ACC-99"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ fontSize: ".78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 3 }}>
              Selling Price (JMD $)
            </label>
            <input
              className="admin-input"
              placeholder="e.g. 3500"
              value={manualPrice}
              onChange={e => setManualPrice(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ fontSize: ".78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 3 }}>
              Category
            </label>
            <select
              className="admin-input"
              value={manualCategory}
              onChange={e => setManualCategory(e.target.value)}
              style={{ width: "100%" }}
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: ".78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 3 }}>
              Image File
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setManualFile(e.target.files?.[0] || null)}
              style={{ fontSize: ".78rem", width: "100%" }}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={manualUploading}
              className="btn btn-pink"
              style={{ width: "100%", padding: ".65rem" }}
            >
              {manualUploading ? "Saving to Supabase…" : "➕ Create & Save to Supabase"}
            </button>
          </div>
        </form>
      )}

      {/* Upload Processing Queue Cards & Bulk Ingest Action Bar */}
      {uploads.length > 0 && (
        <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: ".5rem" }}>
            <div style={{ fontSize: ".85rem", fontWeight: 800, color: "#334155" }}>
              ⚡ Ingestion Queue ({uploads.filter(u => u.status === "done").length}/{uploads.length} Persisted to Supabase)
            </div>
            <div style={{ display: "flex", gap: ".5rem" }}>
              {uploads.some(u => u.status === "error") && (
                <button
                  type="button"
                  onClick={handleRetryAllFailed}
                  disabled={isBulkIngesting}
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: ".75rem", padding: "3px 8px" }}
                >
                  🔄 Retry Failed
                </button>
              )}
              <button
                type="button"
                onClick={() => setUploads([])}
                className="btn btn-outline btn-sm"
                style={{ fontSize: ".75rem", padding: "3px 8px" }}
              >
                ✕ Clear Queue
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: ".6rem", maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
            {uploads.map(u => (
              <div
                key={u.uid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".75rem",
                  padding: ".65rem .85rem",
                  borderRadius: 12,
                  background: u.status === "error" ? "#fef2f2" : u.status === "done" ? "#f0fdf4" : "#fefce8",
                  border: `1px solid ${u.status === "error" ? "#fecaca" : u.status === "done" ? "#bbf7d0" : "#fde68a"}`,
                }}
              >
                <img
                  src={u.product?.image_path || u.product?.image_url || DEFAULT_FALLBACK_URL}
                  alt=""
                  width={46}
                  height={46}
                  style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#f3f4f6" }}
                  onError={imgOnError}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: ".82rem", fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.product?.name || u.name}
                  </p>
                  {u.status === "uploading" && (
                    <p style={{ fontSize: ".74rem", color: "#d97706", margin: "2px 0 0" }}>
                      ⏳ Uploading & upserting directly to Supabase…
                    </p>
                  )}
                  {u.status === "done" && u.product && (
                    <p style={{ fontSize: ".74rem", color: "#059669", margin: "2px 0 0" }}>
                      ✅ <code style={{ fontWeight: 800 }}>{u.product.product_code}</code> · ${Number(u.product.price).toLocaleString()} JMD · {u.product.category}
                    </p>
                  )}
                  {u.status === "error" && (
                    <p style={{ fontSize: ".74rem", color: "#dc2626", margin: "2px 0 0" }}>
                      ❌ {u.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Full Product Editor Modal (For Editing Name, Price, SKU, Category, Image, Stock, and Variants)
 */
function ProductEditModal({ product, categories, onClose, onSave }) {
  const [name, setName] = useState(product.name || "");
  const [price, setPrice] = useState(product.price !== undefined ? String(product.price) : "0");
  const [productCode, setProductCode] = useState(product.product_code || product.code || "");
  const [category, setCategory] = useState(product.category || "Accessories");
  const [imagePath, setImagePath] = useState(product.image_path || product.image || "");
  const [inStock, setInStock] = useState(product.in_stock !== undefined ? Boolean(product.in_stock) : true);
  const [featured, setFeatured] = useState(Boolean(product.featured));
  const [colors, setColors] = useState(product.colors || []);
  const [sizes, setSizes] = useState(product.sizes || []);
  const [showColorSelector, setShowColorSelector] = useState(
    typeof product.showColorSelector === "boolean" ? product.showColorSelector : (colors.length > 0)
  );
  const [showSizeSelector, setShowSizeSelector] = useState(
    typeof product.showSizeSelector === "boolean" ? product.showSizeSelector : (sizes.length > 0)
  );
  const [customColorName, setCustomColorName] = useState("");
  const [customColorHex, setCustomColorHex] = useState("#ff6b9d");
  const [sizesText, setSizesText] = useState((product.sizes || []).join(", "));
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileRef = useRef(null);

  const handleImageUpload = async (file) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const client = supabaseAdmin || supabase;
      if (!client) throw new Error("Supabase client is not configured.");

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filename = `product-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

      const { error: uploadErr } = await client.storage
        .from("product-images")
        .upload(filename, file, {
          contentType: file.type || "image/jpeg",
          upsert: true,
        });

      if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`);

      const { data: { publicUrl } } = client.storage
        .from("product-images")
        .getPublicUrl(filename);

      setImagePath(publicUrl);
    } catch (err) {
      alert(`Image upload failed: ${err.message}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const addPresetColor = (preset) => {
    if (colors.some(c => c.name.toLowerCase() === preset.name.toLowerCase())) return;
    setColors(prev => [...prev, { name: preset.name, hex: preset.hex, inStock: true }]);
    setShowColorSelector(true);
  };

  const addCustomColor = () => {
    if (!customColorName.trim()) return;
    const n = customColorName.trim();
    if (colors.some(c => c.name.toLowerCase() === n.toLowerCase())) return;
    setColors(prev => [...prev, { name: n, hex: customColorHex, inStock: true }]);
    setCustomColorName("");
    setShowColorSelector(true);
  };

  const handleApplySizes = (txt) => {
    setSizesText(txt);
    const parsed = txt.split(",").map(s => s.trim()).filter(Boolean);
    setSizes(parsed);
    if (parsed.length > 0) setShowSizeSelector(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const parsedSizes = sizesText.split(",").map(s => s.trim()).filter(Boolean);
      const updated = {
        ...product,
        name: name.trim(),
        price: parseFloat(price) || 0,
        product_code: productCode.trim(),
        code: productCode.trim(),
        category,
        image_path: imagePath.trim(),
        image_url: imagePath.trim(),
        image: imagePath.trim(),
        in_stock: inStock,
        featured,
        colors,
        sizes: parsedSizes,
        showColorSelector,
        showSizeSelector,
        needs_review: false,
      };
      await onSave(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm modal-overlay"
      onClick={onClose}
    >
      <div className="modal-container" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#1e1b2e" }}>
              ✏️ Edit Product Details
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: ".8rem", color: "#64748b" }}>
              Syncs changes instantly directly into the Supabase database
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#f1f5f9", border: "none", borderRadius: "50%",
              width: 32, height: 32, fontSize: "1.1rem", fontWeight: 800,
              cursor: "pointer", color: "#475569"
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            {/* Row 1: Name & SKU */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>
                  Product Name *
                </label>
                <input
                  className="admin-input"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>
                  SKU / Code (#)
                </label>
                <input
                  className="admin-input"
                  value={productCode}
                  onChange={e => setProductCode(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* Row 2: Price & Category */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>
                  Price (JMD $) *
                </label>
                <input
                  className="admin-input"
                  type="number"
                  required
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  style={{ width: "100%", fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>
                  Category
                </label>
                <select
                  className="admin-input"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Row 3: Image URL & Upload */}
            <div>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 }}>
                Product Image (Permanent Path or URL)
              </label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <img
                  src={imagePath || DEFAULT_FALLBACK_URL}
                  alt=""
                  width={40}
                  height={40}
                  style={{ borderRadius: 8, objectFit: "cover", background: "#f1f5f9", flexShrink: 0 }}
                  onError={imgOnError}
                />
                <input
                  className="admin-input"
                  value={imagePath}
                  onChange={e => setImagePath(e.target.value)}
                  style={{ flex: 1 }}
                  placeholder="/images/example.webp"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn btn-outline btn-sm"
                  disabled={uploadingImage}
                >
                  {uploadingImage ? "Uploading…" : "📁 Upload New"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={e => handleImageUpload(e.target.files?.[0])}
                />
              </div>
            </div>

            {/* Row 4: Stock & Featured Toggles */}
            <div style={{ display: "flex", gap: "1.5rem", background: "#f8fafc", padding: ".75rem 1rem", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", fontWeight: 700, color: "#334155" }}>
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={e => setInStock(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                In Stock (Available for Purchase)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".85rem", fontWeight: 700, color: "#334155" }}>
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={e => setFeatured(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                ⭐ Featured Item
              </label>
            </div>

            {/* Section: Variants */}
            <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".6rem" }}>
                <label style={{ fontSize: ".88rem", fontWeight: 800, color: "#1e1b2e" }}>
                  🎨 Color Variants ({colors.length})
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={showColorSelector}
                    onChange={e => setShowColorSelector(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              {/* Color chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: ".75rem" }}>
                {colors.map((c, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "#fff", border: "1px solid #cbd5e1",
                      borderRadius: 16, padding: "3px 8px 3px 4px", fontSize: ".75rem", fontWeight: 700
                    }}
                  >
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: c.hex || "#ccc", display: "inline-block" }}></span>
                    <span>{c.name}</span>
                    <button
                      type="button"
                      onClick={() => setColors(prev => prev.filter((_, i) => i !== idx))}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", fontSize: ".75rem", padding: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Quick Presets */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: ".75rem" }}>
                {PRESET_SWATCHES.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => addPresetColor(p)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      background: "#fff", border: "1px solid #e2e8f0",
                      borderRadius: 12, padding: "2px 7px", fontSize: ".72rem", cursor: "pointer"
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.hex }}></span>
                    {p.name}
                  </button>
                ))}
              </div>

              {/* Custom color adder */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="color"
                  value={customColorHex}
                  onChange={e => setCustomColorHex(e.target.value)}
                  style={{ width: 30, height: 30, border: "none", borderRadius: 6, cursor: "pointer", padding: 0 }}
                />
                <input
                  className="admin-input"
                  placeholder="Custom color (e.g. Lilac)"
                  value={customColorName}
                  onChange={e => setCustomColorName(e.target.value)}
                  style={{ flex: 1, padding: ".35rem .6rem", fontSize: ".8rem" }}
                />
                <button
                  type="button"
                  onClick={addCustomColor}
                  className="btn btn-pink btn-sm"
                  style={{ padding: ".35rem .75rem", fontSize: ".78rem" }}
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Section: Sizes */}
            <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".6rem" }}>
                <label style={{ fontSize: ".88rem", fontWeight: 800, color: "#1e1b2e" }}>
                  📏 Size Variants
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={showSizeSelector}
                    onChange={e => setShowSizeSelector(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <input
                className="admin-input"
                value={sizesText}
                placeholder="0-3M, 3-6M, 6-12M"
                onChange={e => handleApplySizes(e.target.value)}
                style={{ width: "100%", marginBottom: ".5rem" }}
              />

              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {PRESET_SIZE_OPTIONS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleApplySizes(preset)}
                    style={{
                      background: "#ffffff", border: "1px solid #cbd5e1",
                      borderRadius: 6, padding: "2px 7px", fontSize: ".72rem",
                      fontWeight: 700, cursor: "pointer", color: "#475569"
                    }}
                  >
                    ⚡ {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              style={{ padding: ".55rem 1.2rem", fontSize: ".85rem" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-pink"
              style={{ padding: ".55rem 1.5rem", fontSize: ".85rem" }}
            >
              {saving ? "💾 Saving to Supabase…" : "💾 Save to Supabase"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Variants & Display Rules Modal
 */
function VariantsModal({ product, categories, onClose, onSave }) {
  const [colors, setColors] = useState(product.colors || []);
  const [sizes, setSizes] = useState(product.sizes || []);
  const [showColorSelector, setShowColorSelector] = useState(
    typeof product.showColorSelector === "boolean" ? product.showColorSelector : (colors.length > 0)
  );
  const [showSizeSelector, setShowSizeSelector] = useState(
    typeof product.showSizeSelector === "boolean" ? product.showSizeSelector : (sizes.length > 0)
  );
  const [customColorName, setCustomColorName] = useState("");
  const [customColorHex, setCustomColorHex] = useState("#ff6b9d");
  const [sizesInputText, setSizesInputText] = useState((product.sizes || []).join(", "));
  const [saving, setSaving] = useState(false);

  const addPresetColor = (preset) => {
    if (colors.some(c => c.name.toLowerCase() === preset.name.toLowerCase())) return;
    setColors(prev => [...prev, { name: preset.name, hex: preset.hex, inStock: true }]);
    setShowColorSelector(true);
  };

  const addCustomColor = () => {
    if (!customColorName.trim()) return;
    const name = customColorName.trim();
    if (colors.some(c => c.name.toLowerCase() === name.toLowerCase())) return;
    setColors(prev => [...prev, { name, hex: customColorHex, inStock: true }]);
    setCustomColorName("");
    setShowColorSelector(true);
  };

  const handleApplySizes = (text) => {
    setSizesInputText(text);
    const parsed = text.split(",").map(s => s.trim()).filter(Boolean);
    setSizes(parsed);
    if (parsed.length > 0) {
      setShowSizeSelector(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsedSizes = sizesInputText.split(",").map(s => s.trim()).filter(Boolean);
      const updated = {
        ...product,
        colors,
        sizes: parsedSizes,
        showColorSelector,
        showSizeSelector,
      };
      await onSave(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm modal-overlay"
      onClick={onClose}
    >
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#1e1b2e" }}>
              🎨 Manage Variants & Display Rules
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: ".8rem", color: "#64748b" }}>
              {product.name} (<span style={{ color: "var(--pink)", fontWeight: 700 }}>{product.product_code}</span>)
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#f1f5f9", border: "none", borderRadius: "50%",
              width: 32, height: 32, fontSize: "1.1rem", fontWeight: 800,
              cursor: "pointer", color: "#475569",
            }}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Section 1: Color Variants */}
          <div style={{ background: "#f8fafc", padding: "1.15rem", borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <label style={{ fontSize: ".9rem", fontWeight: 800, color: "#1e1b2e", display: "block" }}>
                  Color Selector Options
                </label>
                <span style={{ fontSize: ".75rem", color: "#64748b" }}>
                  Show or hide color choices on the public storefront
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showColorSelector}
                  onChange={e => setShowColorSelector(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1rem" }}>
              {colors.length === 0 ? (
                <p style={{ fontSize: ".8rem", color: "#94a3b8", fontStyle: "italic", margin: 0 }}>
                  No color swatches configured. Click presets below to add.
                </p>
              ) : (
                colors.map((c, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "#fff", border: "1px solid #cbd5e1",
                      borderRadius: 20, padding: "4px 10px 4px 6px", fontSize: ".82rem", fontWeight: 700
                    }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: c.hex, border: "1px solid rgba(0,0,0,0.1)" }}></span>
                    <span>{c.name}</span>
                    <button
                      type="button"
                      onClick={() => setColors(prev => prev.filter((_, i) => i !== idx))}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", fontSize: ".85rem", padding: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: ".85rem" }}>
              {PRESET_SWATCHES.map(preset => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => addPresetColor(preset)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "#ffffff", border: "1px solid #cbd5e1",
                    borderRadius: 20, padding: "4px 9px", fontSize: ".75rem",
                    fontWeight: 700, cursor: "pointer", color: "#334155",
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: preset.hex }}></span>
                  + {preset.name}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: ".85rem", flexWrap: "wrap" }}>
              <input
                type="color"
                value={customColorHex}
                onChange={e => setCustomColorHex(e.target.value)}
                style={{ width: 34, height: 34, border: "none", borderRadius: 8, cursor: "pointer", padding: 0 }}
              />
              <input
                className="admin-input"
                style={{ flex: 1, minWidth: 140 }}
                placeholder="Custom color name (e.g. Peach)"
                value={customColorName}
                onChange={e => setCustomColorName(e.target.value)}
              />
              <button
                type="button"
                onClick={addCustomColor}
                className="btn btn-pink btn-sm"
              >
                + Add Color
              </button>
            </div>
          </div>

          {/* Section 2: Size Variants */}
          <div style={{ background: "#f8fafc", padding: "1.15rem", borderRadius: 14, border: "1px solid #e2e8f0", marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <label style={{ fontSize: ".9rem", fontWeight: 800, color: "#1e1b2e", display: "block" }}>
                  Size Selector Options
                </label>
                <span style={{ fontSize: ".75rem", color: "#64748b" }}>
                  Show or hide size picker on the public storefront
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showSizeSelector}
                  onChange={e => setShowSizeSelector(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div>
              <label style={{ fontSize: ".78rem", fontWeight: 700, color: "#475569", marginBottom: 4, display: "block" }}>
                Sizes (Comma separated)
              </label>
              <input
                className="admin-input"
                value={sizesInputText}
                placeholder="e.g. 0-3M, 3-6M, 6-12M, 1-2Y"
                onChange={e => handleApplySizes(e.target.value)}
              />
            </div>

            <div style={{ marginTop: ".75rem", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PRESET_SIZE_OPTIONS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleApplySizes(preset)}
                  style={{
                    background: "#ffffff", border: "1px solid #cbd5e1",
                    borderRadius: 6, padding: "3px 8px", fontSize: ".72rem",
                    fontWeight: 700, cursor: "pointer", color: "#475569"
                  }}
                >
                  ⚡ {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline"
            style={{ padding: ".55rem 1.2rem", fontSize: ".85rem" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-pink"
            style={{ padding: ".55rem 1.4rem", fontSize: ".85rem" }}
          >
            {saving ? "💾 Saving to Supabase…" : "💾 Save Variants"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Admin Dashboard Component
 */
export default function AdminClient({ initialProducts }) {
  const [products, setProducts] = useState(initialProducts || []);
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingVariantsProduct, setEditingVariantsProduct] = useState(null);
  const [editingFullProduct, setEditingFullProduct] = useState(null);

  // Categories and Catalog states
  const [customCategories, setCustomCategories] = useState([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("All");
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Search and Filter tabs: "all" | "in_stock" | "needs_review"
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const csvFileRef = useRef(null);

  const showFlash = useCallback((msg, type = "success") => {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 4000);
  }, []);

  // ── INGEST LOCALSTORAGE CACHED EDITS ON MOUNT ─────────────────
  useEffect(() => {
    const cachedEdits = getLocalCacheEdits();
    const editKeys = Object.keys(cachedEdits);

    if (editKeys.length > 0) {
      setProducts(prevProducts => {
        const merged = prevProducts.map(p => {
          const key = p.id || p.product_code || p.code;
          const cached = cachedEdits[key] || cachedEdits[p.id] || cachedEdits[p.product_code] || cachedEdits[p.code];
          return cached ? { ...p, ...cached } : p;
        });

        // Add any new products that only exist in local cache
        editKeys.forEach(k => {
          const cachedItem = cachedEdits[k];
          const exists = merged.some(p => p.id === cachedItem.id || p.product_code === cachedItem.product_code || p.code === cachedItem.code);
          if (!exists && cachedItem.name) {
            merged.unshift(cachedItem);
          }
        });

        return merged;
      });

      // Background sync all cached edits to Supabase
      (async () => {
        let syncedCount = 0;
        for (const k of editKeys) {
          try {
            const item = cachedEdits[k];
            if (item && item.name) {
              await directUpsertSupabase(item);
              syncedCount++;
            }
          } catch (err) {
            console.warn(`[Admin] Background sync error for ${k}:`, err.message);
          }
        }
        if (syncedCount > 0) {
          showFlash(`🔄 Restored & synced ${syncedCount} custom edits to Supabase!`);
        }
      })();
    }
  }, [showFlash]);

  const handleLogout = () => {
    document.cookie = "admin_session=; path=/; max-age=0;";
    window.location.href = "/admin/login";
  };

  const categoriesList = useMemo(() => {
    const set = new Set([...DEFAULT_CATEGORIES, ...customCategories]);
    products.forEach(p => { if (p.category) set.add(p.category); });
    return Array.from(set);
  }, [products, customCategories]);

  const handleProductAdded = useCallback((product) => {
    if (!product) return;
    setProducts(ps => {
      const exists = ps.find(p => p.id === product.id || (p.product_code && p.product_code === product.product_code));
      return exists
        ? ps.map(p => (p.id === product.id || p.product_code === product.product_code) ? product : p)
        : [product, ...ps];
    });
  }, []);

  const handleEdit = (id, field, val) => {
    setProducts(ps => ps.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: val };
      if (field === "price" || field === "name" || field === "product_code") {
        const parsed = parseResilientInput(updated);
        return {
          ...updated,
          price: parsed.price,
          product_code: parsed.product_code,
          needs_review: parsed.needs_review,
        };
      }
      return updated;
    }));
  };

  // ── SAVE PRODUCT DIRECTLY TO SUPABASE ────────────────────────
  const saveProduct = async (product) => {
    setSaving(s => ({ ...s, [product.id]: true }));
    try {
      const updated = await directUpsertSupabase(product);
      setProducts(ps => ps.map(p => (p.id === product.id || p.id === updated.id) ? updated : p));
      showFlash(`✅ Saved "${updated.name}" (${updated.product_code}) directly to Supabase`);
    } catch (err) {
      showFlash(`❌ Save failed: ${err.message}`, "error");
    } finally {
      setSaving(s => ({ ...s, [product.id]: false }));
    }
  };

  const deleteProduct = async (id, name, code) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      const client = supabaseAdmin || supabase;
      if (client) {
        const uuid = toUuid(id || code);
        await client.from("products").delete().or(`id.eq.${uuid},code.eq.${code || id}`);
      }
      deleteFromLocalCache(id, code);
      setProducts(ps => ps.filter(p => p.id !== id && p.product_code !== code));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      showFlash(`🗑 Deleted "${name}"`);
    } catch (err) {
      showFlash(`❌ Delete failed: ${err.message}`, "error");
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Are you sure you want to delete all ${count} selected items?`)) return;

    try {
      const client = supabaseAdmin || supabase;
      const idsToDelete = Array.from(selectedIds);
      const uuids = idsToDelete.map(toUuid);

      if (client) {
        await client.from("products").delete().in("id", uuids);
      }

      idsToDelete.forEach(id => deleteFromLocalCache(id));
      setProducts(ps => ps.filter(p => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      showFlash(`🗑 Deleted ${count} item(s)`);
    } catch (err) {
      showFlash(`❌ Bulk delete failed: ${err.message}`, "error");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStock = async (id) => {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const newStock = !p.in_stock;
    const updated = { ...p, in_stock: newStock };
    setProducts(ps => ps.map(x => x.id === id ? updated : x));

    try {
      await directUpsertSupabase(updated);
      showFlash(`Stock updated: "${p.name}" is now ${newStock ? "In Stock" : "Out of Stock"}`);
    } catch (err) {
      console.error("Failed to update stock:", err);
      showFlash(`❌ Stock update failed: ${err.message}`, "error");
    }
  };

  const handleCreateNewCatalogCategory = (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const cat = newCategoryName.trim();
    if (!customCategories.includes(cat)) {
      setCustomCategories(prev => [...prev, cat]);
    }
    setActiveCategoryFilter(cat);
    setNewCategoryName("");
    setShowNewCategoryModal(false);
    showFlash(`✨ Created new catalog category "${cat}"`);
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: await file.text()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to import CSV");
      setProducts(data.products);
      showFlash(`✅ CSV imported — ${data.products.length} products`);
    } catch (err) {
      showFlash(`❌ ${err.message}`, "error");
    }
    e.target.value = "";
  };

  const downloadCsv = async () => {
    try {
      const blob = await fetch("/api/products?format=csv").then(r => r.blob());
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "products.csv";
      a.click();
    } catch (err) {
      showFlash(`❌ Failed to download CSV: ${err.message}`, "error");
    }
  };

  // Needs Review products
  const needsReviewProducts = useMemo(() => {
    return products.filter(p => p.price === 0 || p.needs_review === true || p.price === "EDIT_ME" || !p.price);
  }, [products]);

  // Main Filtered Products List
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Category filter
      if (activeCategoryFilter !== "All" && p.category !== activeCategoryFilter) {
        return false;
      }
      // Tab filter
      if (activeTab === "in_stock" && !p.in_stock) return false;
      if (activeTab === "needs_review" && !(p.price === 0 || p.needs_review === true || p.price === "EDIT_ME" || !p.price)) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (p.name || "").toLowerCase().includes(q);
        const matchCode = String(p.product_code || p.code || "").toLowerCase().includes(q);
        const matchCat = (p.category || "").toLowerCase().includes(q);
        return matchName || matchCode || matchCat;
      }
      return true;
    });
  }, [products, activeCategoryFilter, activeTab, searchQuery]);

  return (
    <>
      {flash && <div className={`flash flash-${flash.type}`}>{flash.msg}</div>}

      {/* Top Header Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800 }}>⚙️ Admin Dashboard</h2>
          <p style={{ margin: 0, fontSize: ".82rem", color: "#6b7280" }}>Manage inventory, pricing, SKUs & image uploads (Synced to Supabase)</p>
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          <button
            onClick={downloadCsv}
            className="btn btn-outline btn-sm"
            title="Download CSV Catalog"
          >
            ⬇ Export CSV
          </button>
          <button
            onClick={() => csvFileRef.current?.click()}
            className="btn btn-outline btn-sm"
            title="Import CSV Catalog"
          >
            ⬆ Import CSV
          </button>
          <input
            ref={csvFileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleCsvUpload}
          />
          <button
            onClick={handleLogout}
            style={{
              background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca",
              borderRadius: 10, padding: ".55rem 1rem", fontWeight: 700, cursor: "pointer", fontSize: ".85rem"
            }}
          >
            🚪 Sign Out
          </button>
        </div>
      </div>

      {/* Stats Header */}
      <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {[
          ["Total Products", products.length, "#1e1b2e", "all"],
          ["In Stock", products.filter(p => p.in_stock).length, "#059669", "in_stock"],
          ["Needs Review", needsReviewProducts.length, "#dc2626", "needs_review"],
        ].map(([label, value, color, tabKey]) => (
          <div
            key={label}
            onClick={() => setActiveTab(tabKey)}
            style={{
              background: activeTab === tabKey ? "#fff0f6" : "#fff",
              border: `2px solid ${activeTab === tabKey ? "var(--pink)" : "#e5e7eb"}`,
              borderRadius: 12, padding: ".75rem 1.25rem", textAlign: "center", minWidth: 110, cursor: "pointer",
              boxShadow: activeTab === tabKey ? "0 4px 12px rgba(255, 107, 157, 0.2)" : "none"
            }}
          >
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: ".7rem", color: "#6b7280", fontWeight: 700 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Merged Bulk AI Product Ingestion System */}
      <AiProductIngestionSystem
        categories={categoriesList}
        onProductAdded={handleProductAdded}
        showFlash={showFlash}
      />

      {/* Products Table Section with Restored Catalog Toolbar */}
      <div className="admin-section">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.25rem" }}>
          {/* Top Row: Title, Search, Tab Filters, and Bulk Delete */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: ".75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>
                📦 Products Catalog <span style={{ fontSize: ".85rem", color: "#64748b", fontWeight: 600 }}>({filteredProducts.length})</span>
              </h2>

              {/* Status Filter Tabs */}
              <div style={{ display: "flex", gap: 4, background: "#f1f5f9", padding: 4, borderRadius: 10 }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  style={{
                    padding: "4px 10px", borderRadius: 7, border: "none",
                    background: activeTab === "all" ? "#fff" : "transparent",
                    color: activeTab === "all" ? "#1e1b2e" : "#64748b",
                    fontWeight: 700, fontSize: ".78rem", cursor: "pointer",
                    boxShadow: activeTab === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                  }}
                >
                  All ({products.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("in_stock")}
                  style={{
                    padding: "4px 10px", borderRadius: 7, border: "none",
                    background: activeTab === "in_stock" ? "#fff" : "transparent",
                    color: activeTab === "in_stock" ? "#059669" : "#64748b",
                    fontWeight: 700, fontSize: ".78rem", cursor: "pointer",
                    boxShadow: activeTab === "in_stock" ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                  }}
                >
                  In Stock ({products.filter(p => p.in_stock).length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("needs_review")}
                  style={{
                    padding: "4px 10px", borderRadius: 7, border: "none",
                    background: activeTab === "needs_review" ? "#fee2e2" : "transparent",
                    color: activeTab === "needs_review" ? "#dc2626" : "#64748b",
                    fontWeight: 700, fontSize: ".78rem", cursor: "pointer",
                    boxShadow: activeTab === "needs_review" ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                  }}
                >
                  ⚠️ Needs Review ({needsReviewProducts.length})
                </button>
              </div>
            </div>

            {/* Right Actions: Search Box & Bulk Delete */}
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
              <div style={{ position: "relative", width: 220 }}>
                <input
                  className="admin-input"
                  placeholder="🔍 Search name or SKU…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ borderRadius: 8, padding: ".4rem .6rem", fontSize: ".82rem" }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: "#94a3b8", fontSize: ".8rem" }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  style={{
                    background: "#dc2626", color: "#fff", border: "none",
                    borderRadius: 8, padding: ".45rem .85rem", fontWeight: 700,
                    cursor: "pointer", fontSize: ".82rem", display: "flex", alignItems: "center", gap: 6,
                    boxShadow: "0 2px 8px rgba(220, 38, 38, 0.25)"
                  }}
                >
                  🗑 Delete ({selectedIds.size})
                </button>
              )}
            </div>
          </div>

          {/* Restored Category Toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: ".6rem", borderTop: "1px solid #f1f5f9", paddingTop: ".85rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".45rem", alignItems: "center" }}>
              <span style={{ fontSize: ".78rem", fontWeight: 800, color: "#64748b", marginRight: 4 }}>Catalog Categories:</span>
              <button
                type="button"
                onClick={() => setActiveCategoryFilter("All")}
                style={{
                  padding: ".35rem .75rem",
                  borderRadius: 16,
                  border: `1.5px solid ${activeCategoryFilter === "All" ? "var(--pink)" : "#e2e8f0"}`,
                  background: activeCategoryFilter === "All" ? "var(--pink)" : "#ffffff",
                  color: activeCategoryFilter === "All" ? "#ffffff" : "#475569",
                  fontSize: ".78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all .15s"
                }}
              >
                All Categories
              </button>
              {categoriesList.map(cat => {
                const isActive = activeCategoryFilter === cat;
                const catCount = products.filter(p => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategoryFilter(cat)}
                    style={{
                      padding: ".35rem .75rem",
                      borderRadius: 16,
                      border: `1.5px solid ${isActive ? "var(--pink)" : "#e2e8f0"}`,
                      background: isActive ? "var(--pink)" : "#ffffff",
                      color: isActive ? "#ffffff" : "#475569",
                      fontSize: ".78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all .15s"
                    }}
                  >
                    {cat} <span style={{ opacity: 0.8, fontSize: ".72rem" }}>({catCount})</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowNewCategoryModal(true)}
              className="btn btn-teal btn-sm"
              style={{ padding: ".4rem .9rem", fontSize: ".8rem", borderRadius: 10 }}
            >
              ➕ + New Catalog
            </button>
          </div>
        </div>

        {/* Product List Table */}
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                    onChange={toggleSelectAll}
                    title="Select All"
                    style={{ cursor: "pointer", width: 16, height: 16 }}
                  />
                </th>
                <th>Image</th>
                <th>Name</th>
                <th>Price (JMD)</th>
                <th>SKU (#)</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Variants</th>
                <th>Actions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#94a3b8" }}>
                    No products matching current filters.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const isSelected = selectedIds.has(p.id);
                  const colors = p.colors || [];
                  const sizes = p.sizes || [];
                  const needsRev = p.price === 0 || p.needs_review === true || p.price === "EDIT_ME" || !p.price;

                  return (
                    <tr key={p.id} style={{ background: isSelected ? "#fff0f6" : needsRev ? "#fef2f2" : "transparent" }}>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(p.id)}
                          style={{ cursor: "pointer", width: 16, height: 16 }}
                        />
                      </td>
                      <td>
                        <img
                          src={p.image_path || p.image_url || DEFAULT_FALLBACK_URL}
                          alt={p.name}
                          width={48}
                          height={48}
                          style={{ borderRadius: 8, objectFit: "cover", background: "#f3f4f6" }}
                          onError={imgOnError}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          style={{ minWidth: 140 }}
                          value={p.name || ""}
                          onChange={e => handleEdit(p.id, "name", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          style={{ width: 85, border: needsRev ? "2px solid #ef4444" : "1px solid #d1d5db" }}
                          value={p.price !== undefined ? p.price : 0}
                          placeholder="0"
                          onChange={e => handleEdit(p.id, "price", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          style={{ width: 95 }}
                          value={p.product_code || p.code || ""}
                          onChange={e => handleEdit(p.id, "product_code", e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="admin-input"
                          style={{ width: 135 }}
                          value={p.category || "Accessories"}
                          onChange={e => handleEdit(p.id, "category", e.target.value)}
                        >
                          {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => toggleStock(p.id)}
                          style={{
                            padding: "3px 10px",
                            borderRadius: 8,
                            border: "none",
                            cursor: "pointer",
                            fontWeight: 700,
                            fontSize: ".75rem",
                            background: p.in_stock ? "#d1fae5" : "#fee2e2",
                            color: p.in_stock ? "#065f46" : "#991b1b"
                          }}
                        >
                          {p.in_stock ? "✓ In Stock" : "✗ OOS"}
                        </button>
                      </td>
                      <td>
                        <span className={`tag ${needsRev ? "tag-needs-edit" : "tag-ok"}`}>
                          {needsRev ? "⚠️ Needs Review" : "OK"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setEditingVariantsProduct(p)}
                          style={{
                            background: (colors.length > 0 || sizes.length > 0) ? "#fff0f6" : "#f1f5f9",
                            color: (colors.length > 0 || sizes.length > 0) ? "var(--pink)" : "#475569",
                            border: `1px solid ${(colors.length > 0 || sizes.length > 0) ? "var(--pink)" : "#cbd5e1"}`,
                            borderRadius: 8,
                            padding: "4px 8px",
                            fontSize: ".75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          🎨 Variants ({colors.length + sizes.length})
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ padding: "4px 8px", fontSize: ".75rem" }}
                            onClick={() => setEditingFullProduct(p)}
                            title="Full Product Editor"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-pink btn-sm"
                            style={{ padding: "4px 10px", fontSize: ".75rem" }}
                            onClick={() => saveProduct(p)}
                            disabled={saving[p.id]}
                          >
                            {saving[p.id] ? "…" : "💾 Save"}
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => deleteProduct(p.id, p.name, p.product_code || p.code)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "1rem" }}
                          title="Delete"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Product Editor Modal */}
      {editingFullProduct && (
        <ProductEditModal
          product={editingFullProduct}
          categories={categoriesList}
          onClose={() => setEditingFullProduct(null)}
          onSave={async (updatedProduct) => {
            setEditingFullProduct(null);
            await saveProduct(updatedProduct);
          }}
        />
      )}

      {/* Variants Manager Modal */}
      {editingVariantsProduct && (
        <VariantsModal
          product={editingVariantsProduct}
          categories={categoriesList}
          onClose={() => setEditingVariantsProduct(null)}
          onSave={async (updatedProduct) => {
            setEditingVariantsProduct(null);
            await saveProduct(updatedProduct);
          }}
        />
      )}

      {/* "+ New Catalog" Modal */}
      {showNewCategoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm modal-overlay"
          onClick={() => setShowNewCategoryModal(false)}
        >
          <div className="modal-container" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#1e1b2e" }}>
                ➕ Create New Catalog Category
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCategoryModal(false)}
                style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: 28, height: 28, fontSize: "1rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateNewCatalogCategory}>
              <div className="modal-body">
                <div>
                  <label style={{ display: "block", fontSize: ".82rem", fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                    Category Name
                  </label>
                  <input
                    className="admin-input"
                    placeholder="e.g. Footwear & Shoes, Strollers, Bath & Care"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowNewCategoryModal(false)}
                  className="btn btn-outline"
                  style={{ padding: ".5rem 1rem", fontSize: ".85rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-teal"
                  style={{ padding: ".5rem 1.2rem", fontSize: ".85rem" }}
                >
                  Create Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
