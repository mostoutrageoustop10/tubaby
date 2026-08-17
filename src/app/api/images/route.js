import { NextResponse } from "next/server";
import fs   from "fs";
import path from "path";
import { compressImage }     from "@/lib/compress";
import { addProduct, detectCategory, applyMarkup, extractFromFilename } from "@/lib/products";
import { supabase, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const IMAGES_DIR = path.join(process.cwd(), "public", "images");
const ALLOWED    = new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
const MAX_BYTES  = 10 * 1024 * 1024;

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

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file     = formData.get("file");

    if (!file)                   return NextResponse.json({ error:"No file provided" },  { status:400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error:"Images only" },         { status:400 });

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    if (rawBuffer.byteLength > MAX_BYTES) return NextResponse.json({ error:"Max 10 MB" }, { status:400 });

    // Compress + convert to WebP
    const { buffer, filename: savedName, originalKb, compressedKb } =
      await compressImage(rawBuffer, file.name);

    let imagePath = `/images/${savedName}`;
    const storageClient = supabaseAdmin || supabase;

    if (storageClient) {
      try {
        const { data: uploadData, error: uploadError } = await storageClient.storage
          .from("product-images")
          .upload(savedName, buffer, {
            contentType: "image/webp",
            upsert: true,
          });

        if (uploadError) {
          console.warn("Supabase Storage upload failed, saving locally:", uploadError.message);
          fs.mkdirSync(IMAGES_DIR, { recursive: true });
          fs.writeFileSync(path.join(IMAGES_DIR, savedName), buffer);
        } else {
          const { data: { publicUrl } } = storageClient.storage
            .from("product-images")
            .getPublicUrl(savedName);
          imagePath = publicUrl;
        }
      } catch (e) {
        console.warn("Supabase Storage exception, saving locally:", e.message);
        fs.mkdirSync(IMAGES_DIR, { recursive: true });
        fs.writeFileSync(path.join(IMAGES_DIR, savedName), buffer);
      }
    } else {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
      fs.writeFileSync(path.join(IMAGES_DIR, savedName), buffer);
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
    const name      = aiData.name         || fb.name      || path.parse(savedName).name.replace(/[_-]+/g," ");
    const basePrice = aiData.base_price   || fb.basePrice || null;
    const code      = aiData.product_code || fb.code      || null;
    const category  = aiData.category     || detectCategory(name + " " + savedName);
    const price     = applyMarkup(basePrice, category) || 0;

    const product = await addProduct({
      name, product_code: code, price, base_price: basePrice,
      category, image_path: imagePath,
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
    if (storageClient) {
      try {
        const { data, error } = await storageClient.storage
          .from("product-images")
          .list("", { limit: 100 });
        if (!error && data) {
          const files = data.map(f => {
            const { data: { publicUrl } } = storageClient.storage
              .from("product-images")
              .getPublicUrl(f.name);
            return { name: f.name, path: publicUrl };
          });
          return NextResponse.json(files);
        }
      } catch (e) {
        console.warn("Supabase Storage list failed, using local files:", e.message);
      }
    }

    const EXTS = new Set([".jpg",".jpeg",".png",".webp",".gif",".avif"]);
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    const files = fs.readdirSync(IMAGES_DIR)
      .filter(f => EXTS.has(path.extname(f).toLowerCase()))
      .map(f => ({ name: f, path: `/images/${f}` }));
    return NextResponse.json(files);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
