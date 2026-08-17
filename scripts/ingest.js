#!/usr/bin/env node
/**
 * scripts/ingest.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hybrid product ingestion — manual + AI (Claude vision) + markup pricing
 *
 * Flow per image:
 *   1. Skip if product_code already in Supabase (duplicate guard)
 *   2. Try Claude vision  → extract name, code, base_price, category
 *   3. Fallback to filename parsing if AI unavailable
 *   4. Apply markup pricing by category
 *   5. Upsert to Supabase + write local JSON/CSV backup
 *
 * Filename format (fallback):  NAME__CODE__BASE_PRICE.jpg
 *   e.g.  BABY_CARRIER__EN71-2__980.jpeg
 *
 * Usage:
 *   node scripts/ingest.js              # normal run
 *   node scripts/ingest.js --dry-run    # preview, nothing saved
 *   node scripts/ingest.js --no-ai      # skip Claude, filename only
 */

require("dotenv").config({ path: ".env.local" });

const fs   = require("fs");
const path = require("path");
const https = require("https");

// ── Config ────────────────────────────────────────────────────
const IMAGES_DIR  = path.join(__dirname, "../public/images");
const OUTPUT_JSON = path.join(__dirname, "../public/products.json");
const OUTPUT_CSV  = path.join(__dirname, "../products.csv");
const IMAGE_EXTS  = new Set([".jpg",".jpeg",".png",".webp",".gif",".avif"]);

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const DRY_RUN = process.argv.includes("--dry-run");
const NO_AI   = process.argv.includes("--no-ai") || !ANTHROPIC_KEY;

// ── YOUR markup pricing logic (preserved exactly) ─────────────
const MARKUP = { carrier: 1.8, accessory: 2.5, toy: 1.6, default: 1.5 };

function applyMarkup(basePrice, category) {
  if (!basePrice || isNaN(Number(basePrice))) return 0;
  const cat = String(category).toLowerCase();
  const key = cat.includes("carrier") ? "carrier"
    : (cat.includes("accessory") || cat.includes("accessories") || cat.includes("turban") || cat.includes("cap")) ? "accessory"
    : (cat.includes("toy") || cat.includes("bouncer") || cat.includes("rocker")) ? "toy"
    : "default";
  return Math.round(Number(basePrice) * MARKUP[key]);
}

// ── YOUR category detection (preserved exactly) ───────────────
function detectCategory(name) {
  const n = name.toLowerCase();
  if (n.includes("carrier"))                                                  return "Baby Carriers";
  if (n.includes("turban") || n.includes("cap") || n.includes("headband"))   return "Accessories";
  if (n.includes("rocker") || n.includes("bouncer") || n.includes("toy"))    return "Toys & Bouncers";
  return "Accessories";
}

// ── Filename parser ───────────────────────────────────────────
function extractFromFilename(filename) {
  if (!filename) return { name: "Product", code: null, basePrice: null };

  // 1. STRING SANITIZATION FIRST
  // Strip out file extensions BEFORE running regex pattern matching
  let str = filename.replace(/\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff)$/i, "").trim();

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

// ── Claude vision ─────────────────────────────────────────────
function post(hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req  = https.request({ hostname, path: urlPath, method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "Content-Length": data.length }
    }, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error(raw.slice(0,300))); } });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function extractWithClaude(filePath, filename) {
  const b64  = fs.readFileSync(filePath).toString("base64");
  const mime = filePath.endsWith(".png") ? "image/png" : filePath.endsWith(".webp") ? "image/webp" : "image/jpeg";

  const res = await post("api.anthropic.com", "/v1/messages",
    { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    {
      model: "claude-sonnet-4-6", max_tokens: 512,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
        { type: "text", text:
`You are a product data extractor for a baby shop in Jamaica.
Read this product image. Return ONLY valid JSON, no markdown, no explanation.
Extract: name (string), product_code (string or null), base_price (number or null), category (one of "Baby Carriers"|"Accessories"|"Toys & Bouncers"), description (one sentence).
Filename hint: "${filename}"
{"name":"...","product_code":null,"base_price":null,"category":"...","description":"..."}`
        }
      ]}]
    }
  );
  const text = (res.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
  return JSON.parse(text.replace(/```json|```/gi,"").trim());
}

// ── Supabase upsert ───────────────────────────────────────────
async function supabaseUpsert(rows) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const parsed  = new URL(`${SUPABASE_URL}/rest/v1/products?on_conflict=product_code`);
  const body    = Buffer.from(JSON.stringify(rows));
  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: "POST",
      headers: {
        "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates",
        "Content-Length": body.length,
      }
    }, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`Supabase ${res.statusCode}: ${raw}`));
        else resolve();
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Load existing ─────────────────────────────────────────────
let existingProducts = [];
if (fs.existsSync(OUTPUT_JSON)) {
  existingProducts = JSON.parse(fs.readFileSync(OUTPUT_JSON, "utf-8"));
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error("❌  public/images/ folder not found"); process.exit(1);
  }

  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase())).sort();

  console.log(`\n📂  ${files.length} images found`);
  if (DRY_RUN) console.log("🔍  DRY RUN — nothing saved");
  if (NO_AI)   console.log("⚙   AI off — filename only\n");

  const newProducts = [];

  for (const file of files) {
    const fb = extractFromFilename(file);
    const safeFilename = file.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "").replace(/\.[^.]+$/, ".webp");
    const imagePath = `/images/${safeFilename}`;

    // Code duplicate merging guard
    if (fb.code) {
      const existingMatch = existingProducts.find(p => p.product_code === fb.code) || newProducts.find(p => p.product_code === fb.code);
      if (existingMatch) {
        console.log(`  🔄  ${file} — duplicate code (${fb.code}), merging image/color variant into single record`);
        existingMatch.images = Array.from(new Set([...(existingMatch.images || [existingMatch.image_path]), imagePath]));
        continue;
      }
    }

    let { name, code, basePrice } = fb;
    let category, description, source;

    if (!NO_AI) {
      try {
        const ai = await extractWithClaude(path.join(IMAGES_DIR, file), file);
        name        = ai.name         || name;
        code        = ai.product_code || code;
        basePrice   = ai.base_price   || basePrice;
        category    = ai.category;
        description = ai.description;
        source      = "claude-vision";
        console.log(`  🤖  ${file} → "${name}" base $${basePrice} (AI)`);
      } catch (e) {
        source = "filename";
        console.log(`  📄  ${file} → "${name}" base $${basePrice} (filename: ${e.message.slice(0,60)})`);
      }
    } else {
      source = "filename"; console.log(`  📄  ${file} → "${name}" base $${basePrice}`);
    }

    category    = category    || detectCategory(name + " " + file);
    code        = code        || `PROD-${String(newProducts.length + existingProducts.length + 1).padStart(4,"0")}`;
    const price = applyMarkup(basePrice, category); // YOUR markup logic

    console.log(`       → sell $${price} (${category}, markup ${MARKUP[category.toLowerCase().includes("carrier")?"carrier":category.toLowerCase().includes("accessor")?"accessory":"toy"] || MARKUP.default}x)`);

    const safeFilename = file.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "").replace(/\.[^.]+$/, ".webp");

    newProducts.push({
      name, product_code: code,
      price,
      base_price:  basePrice || null,
      category,
      image_path:  `/images/${safeFilename}`,
      image:       `/images/${safeFilename}`,  // alias kept for compatibility
      in_stock:    true,
      stock:       true,               // YOUR field name
      featured:    false,
      source,
      description: description || null,
      created_at:  new Date().toISOString(),
    });
  }

  if (!newProducts.length) { console.log("\n✅  No new products.\n"); return; }
  if (DRY_RUN)             { console.log("\n📋  Preview:\n", JSON.stringify(newProducts,null,2)); return; }

  // Save locally
  const all = [...existingProducts, ...newProducts];
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(all, null, 2));

  const csvHeader = "id,name,product_code,price,base_price,category,image_path,in_stock,featured,source\n";
  const csvRows   = all.map((p,i) =>
    `${i+1},"${p.name}",${p.product_code},${p.price},${p.base_price??""},${p.category},${p.image_path},${p.in_stock},${p.featured},${p.source}`
  );
  fs.writeFileSync(OUTPUT_CSV, csvHeader + csvRows.join("\n"));

  // Push to Supabase
  try {
    await supabaseUpsert(newProducts);
    console.log(`\n✅  ${newProducts.length} products upserted to Supabase`);
  } catch(e) {
    console.warn("  ⚠  Supabase:", e.message, "(saved locally only)");
  }

  console.log(`📦  Total: ${all.length}  |  JSON: ${OUTPUT_JSON}  |  CSV: ${OUTPUT_CSV}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
