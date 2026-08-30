import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { suggestBundles } from "@/lib/product-shared";
import { resolveImagePath } from "@/lib/imageUtils";
import ProductDetailClient from "./ProductDetailClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const code = item.product_code || item.code || "";

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
    images: images.length > 0 ? images.map(img => resolveImagePath(img, code)) : [image],
    description,
    needs_review: Boolean(item.needs_review),
    variants: v || []
  };
}

function getSupabaseClient() {
  if (supabaseAdmin) return supabaseAdmin;
  if (supabase) return supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    return createClient(url, key);
  }
  return null;
}

async function fetchProductById(id) {
  if (!id) return null;

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (!error && data) {
        return normalizeProduct(data);
      }

      // If lookup by id failed, try looking up by product_code or code
      const { data: altData, error: altErr } = await client
        .from("products")
        .select("*")
        .or(`product_code.eq.${id},code.eq.${id}`)
        .maybeSingle();

      if (!altErr && altData) {
        return normalizeProduct(altData);
      }
    } catch (err) {
      console.warn(`Supabase fetch failed for product id=${id}:`, err?.message);
    }
  }

  // If Supabase is unreachable (e.g. offline local development), check local products.json matching this exact id/code
  try {
    const jsonPath = path.join(process.cwd(), "public", "products.json");
    if (fs.existsSync(jsonPath)) {
      const fileData = fs.readFileSync(jsonPath, "utf-8");
      const list = JSON.parse(fileData);
      if (Array.isArray(list)) {
        const found = list.find(p => String(p.id) === String(id) || String(p.product_code) === String(id) || String(p.code) === String(id));
        if (found) {
          return normalizeProduct(found);
        }
      }
    }
  } catch (err) {
    console.warn("Local products.json read error:", err);
  }

  return null;
}

export async function generateMetadata({ params }) {
  const id = params?.id;
  const product = await fetchProductById(id);

  if (!product) {
    return {
      title: "Product Not Found | TiiBaby Shop Jamaica",
      description: "The requested baby product could not be found.",
    };
  }

  const cleanCode = String(product.product_code || product.code || "").replace(/^#/, "");
  const title = `${product.name} | TiiBaby Shop Jamaica`;
  const description = product.description || `Shop ${product.name} (#${cleanCode}) for $${Number(product.price).toLocaleString()} JMD at TiiBaby Shop Jamaica.`;
  const imageUrl = product.image_path || product.image || "/placeholder.png";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 800,
          height: 800,
          alt: product.name,
        },
      ],
      type: "website",
      siteName: "TiiBaby Shop 🌸",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function ProductPage({ params }) {
  const id = params?.id;
  const product = await fetchProductById(id);
  let bundles = [];

  if (product) {
    try {
      const client = getSupabaseClient();
      let all = [];
      if (client) {
        const { data: allData, error } = await client
          .from("products")
          .select("*", { count: "exact" });
        if (!error && Array.isArray(allData)) {
          all = allData.map(normalizeProduct);
        }
      }
      if (all.length === 0) {
        const jsonPath = path.join(process.cwd(), "public", "products.json");
        if (fs.existsSync(jsonPath)) {
          const fileData = fs.readFileSync(jsonPath, "utf-8");
          const list = JSON.parse(fileData);
          if (Array.isArray(list)) all = list.map(normalizeProduct);
        }
      }
      if (all.length > 0) {
        bundles = suggestBundles(product, all);
      }
    } catch (err) {
      console.warn("Bundle suggestion error:", err);
    }
  }

  // Schema.org Product JSON-LD if product is found
  const jsonLd = product ? {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "image": product.image_path ? [product.image_path] : [],
    "description": product.description || product.name,
    "sku": String(product.product_code || product.code || "").replace(/^#/, ""),
    "offers": {
      "@type": "Offer",
      "priceCurrency": "JMD",
      "price": product.price || 0,
      "availability": product.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "seller": {
        "@type": "Organization",
        "name": "TiiBaby Shop"
      }
    }
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductDetailClient initialProduct={product} initialBundles={bundles} />
    </>
  );
}
