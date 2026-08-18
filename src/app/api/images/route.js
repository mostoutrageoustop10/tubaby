import { NextResponse } from "next/server";
import { compressImage } from "@/lib/compress";
import { addProduct, detectCategory, applyMarkup, extractFromFilename } from "@/lib/products";
import { supabase, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "auto";

const ALLOWED  = new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
const MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_FALLBACK_URL = "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=500&q=80";

async function extractWithClaude(buffer, mimeType, filename) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 512,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mimeType, data: buffer.toString("base64") } },
        { type: "text", text:
`You are a product data extractor for a baby shop in Jamaica.
Read this product image. Return ONLY valid JSON — no markdown, no explanation.
Extract: name, product_code (or null), base_price (numeric or null), category (one of "Baby Carriers"|"Accessories"|"Toys & Bouncers"), description (one sentence).
Filename hint: "${filename}"
{"name":"...","product_code":null,"base_price":null,"category":"...","description":"..."}`
        }
      ]}]
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
  return JSON.parse(text.replace(/```json|```/gi,"").trim());
}

async function uploadToSupabase(storageClient, filename, buffer, contentType) {
  const { data, error } = await storageClient.storage
    .from("product-images")
    .upload(filename, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data: { publicUrl } } = storageClient.storage
    .from("product-images")
    .getPublicUrl(filename);

  return publicUrl;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file     = formData.get("file");

    if (!file)                   return NextResponse.json({ error:"No file provided" },  { status:400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error:"Images only" },        { status:400 });

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    if (rawBuffer.byteLength > MAX_BYTES) return NextResponse.json({ error:"Max 10 MB" }, { status:400 });

    // Compress + convert to WebP
    const { buffer, filename: savedName, originalKb, compressedKb } =
      await compressImage(rawBuffer, file.name);

    const storageClient = supabaseAdmin || supabase;
    let imagePath = DEFAULT_FALLBACK_URL;

    if (storageClient) {
      try {
        imagePath = await uploadToSupabase(storageClient, savedName, buffer, "image/webp");
      } catch (e) {
        console.error("Supabase Storage upload failed:", e.message);
        return NextResponse.json({ error: `Image storage failed: ${e.message}` }, { status: 500 });
      }
    } else {
      console.warn("No Supabase client configured — image not stored.");
      return NextResponse.json({ error: "Supabase storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and keys." }, { status: 503 });
    }

    // Try Claude vision
    let aiData = {}, source = "filename";
    try {
      aiData = await extractWithClaude(rawBuffer, file.type, savedName);
      source = "claude-vision";
    } catch (e) {
      console.warn("Claude vision skipped:", e.message);
    }

    // Merge with filename fallback
    const fb        = extractFromFilename(savedName);
    const name      = aiData.name         || fb.name      || savedName.replace(/[_-]+/g," ");
    const basePrice = aiData.base_price   || fb.basePrice || null;
    const code      = aiData.product_code || fb.code      || null;
    const category  = aiData.category     || detectCategory(name + " " + savedName);
    const price     = applyMarkup(basePrice, category) || 0;

    const product = await addProduct({
      name, product_code: code, price, base_price: basePrice,
      category, image_path: imagePath, images: [imagePath],
      description: aiData.description || null, source,
    });

    return NextResponse.json({
      ok: true, product, source,
      compression: {
        originalKb:  Math.round(originalKb),
        compressedKb: Math.round(compressedKb),
        saving: `${Math.round((1 - compressedKb/originalKb)*100)}%`,
      },
    }, { status: 201 });

  } catch (err) {
    console.error("Image upload error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const storageClient = supabaseAdmin || supabase;
    if (!storageClient) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const { data, error } = await storageClient.storage
      .from("product-images")
      .list("", { limit: 200 });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const files = (data || []).map(f => {
      const { data: { publicUrl } } = storageClient.storage
        .from("product-images")
        .getPublicUrl(f.name);
      return { name: f.name, path: publicUrl };
    });

    return NextResponse.json(files);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
