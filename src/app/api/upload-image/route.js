import { NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "auto";

const DEFAULT_FALLBACK_URL = "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=500&q=80";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    // No file provided → return default fallback image URL
    if (!file || typeof file === "string" || !file.name) {
      return NextResponse.json({ ok: true, url: DEFAULT_FALLBACK_URL, fallback: true });
    }

    const storageClient = supabaseAdmin || supabase;
    if (!storageClient) {
      console.warn("Supabase not configured — returning fallback URL");
      return NextResponse.json({ ok: true, url: DEFAULT_FALLBACK_URL, fallback: true });
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filename = `product-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

    // Upload directly to Supabase Storage — no local filesystem fallback
    const { data, error } = await storageClient.storage
      .from("product-images")
      .upload(filename, rawBuffer, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.error("Supabase Storage upload error:", error.message);
      return NextResponse.json({ error: `Image storage failed: ${error.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = storageClient.storage
      .from("product-images")
      .getPublicUrl(filename);

    return NextResponse.json({ ok: true, url: publicUrl, filename });
  } catch (err) {
    console.error("Upload image error:", err);
    return NextResponse.json({ ok: true, url: DEFAULT_FALLBACK_URL, error: err.message });
  }
}
