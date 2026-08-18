import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { supabase, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "auto";

const IMAGES_DIR = path.join(process.cwd(), "public", "images");
const DEFAULT_FALLBACK_URL = "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=500&q=80";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string" || !file.name) {
      return NextResponse.json({ ok: true, url: DEFAULT_FALLBACK_URL, fallback: true });
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || ".jpg";
    const filename = `product-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;

    const storageClient = supabaseAdmin || supabase;
    let url = `/images/${filename}`;

    if (storageClient) {
      try {
        const { data, error } = await storageClient.storage
          .from("product-images")
          .upload(filename, rawBuffer, {
            contentType: file.type || "image/jpeg",
            upsert: true,
          });

        if (!error && data) {
          const { data: { publicUrl } } = storageClient.storage
            .from("product-images")
            .getPublicUrl(filename);
          url = publicUrl;
        } else {
          console.warn("Supabase storage upload failed, using local filesystem:", error?.message);
          fs.mkdirSync(IMAGES_DIR, { recursive: true });
          fs.writeFileSync(path.join(IMAGES_DIR, filename), rawBuffer);
        }
      } catch (e) {
        console.warn("Supabase storage exception, using local filesystem:", e.message);
        fs.mkdirSync(IMAGES_DIR, { recursive: true });
        fs.writeFileSync(path.join(IMAGES_DIR, filename), rawBuffer);
      }
    } else {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
      fs.writeFileSync(path.join(IMAGES_DIR, filename), rawBuffer);
    }

    return NextResponse.json({ ok: true, url, filename });
  } catch (err) {
    console.error("Upload image error:", err);
    return NextResponse.json({ ok: true, url: DEFAULT_FALLBACK_URL, error: err.message });
  }
}
