import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import Nav from "@/components/Nav";
import ShopClient from "@/components/ShopClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getFallbackProducts() {
  try {
    const jsonPath = path.join(process.cwd(), "public", "products.json");
    if (fs.existsSync(jsonPath)) {
      const fileData = fs.readFileSync(jsonPath, "utf-8");
      const products = JSON.parse(fileData);
      if (Array.isArray(products) && products.length > 0) {
        return products.map((p, idx) => ({
          id: p.id || String(idx + 1),
          name: p.name || "Unnamed Product",
          product_code: p.product_code || p.code || `ACC-${idx + 1}`,
          code: p.product_code || p.code || `ACC-${idx + 1}`,
          price: Number(p.price) || 0,
          category: p.category || "Accessories",
          image_path: p.image_path || p.image || p.image_url || "/placeholder.png",
          image: p.image_path || p.image || p.image_url || "/placeholder.png",
          image_url: p.image_path || p.image || p.image_url || "/placeholder.png",
          in_stock: p.in_stock !== undefined ? Boolean(p.in_stock) : true,
          featured: Boolean(p.featured),
          needs_review: Boolean(p.needs_review),
          variants: p.variants || [],
          images: Array.isArray(p.images) ? p.images : (p.image_path ? [p.image_path] : [])
        }));
      }
    }
  } catch (err) {
    console.error("Error reading fallback products.json:", err);
  }
  return [];
}

async function fetchProducts() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((item, idx) => {
          const v = item.variants;
          const isObjectVariant = v && typeof v === "object" && !Array.isArray(v);

          const colors = isObjectVariant && Array.isArray(v.colors) ? v.colors : (Array.isArray(v) ? v : (item.colors || []));
          const sizes = isObjectVariant && Array.isArray(v.sizes) ? v.sizes : (item.sizes || []);
          const showColorSelector = isObjectVariant && typeof v.showColorSelector === "boolean" ? v.showColorSelector : (item.showColorSelector ?? (colors.length > 0));
          const showSizeSelector = isObjectVariant && typeof v.showSizeSelector === "boolean" ? v.showSizeSelector : (item.showSizeSelector ?? (sizes.length > 0));
          const in_stock = isObjectVariant && typeof v.in_stock === "boolean" ? v.in_stock : (item.in_stock !== undefined ? Boolean(item.in_stock) : true);
          const featured = isObjectVariant && typeof v.featured === "boolean" ? v.featured : Boolean(item.featured);
          const image = item.image_url || item.image_path || item.image || "/placeholder.png";
          const code = item.code || item.product_code || `ACC-${idx + 1}`;

          return {
            id: item.id || String(idx + 1),
            name: item.name || "Unnamed Product",
            product_code: code,
            code,
            price: Number(item.price) || 0,
            category: item.category || "Accessories",
            image_path: image,
            image,
            image_url: image,
            in_stock,
            featured,
            colors,
            sizes,
            showColorSelector,
            showSizeSelector,
            needs_review: Boolean(item.needs_review),
            variants: v || [],
            images: isObjectVariant && Array.isArray(v.images) ? v.images : (Array.isArray(item.images) ? item.images : [image])
          };
        });
      }
      if (error) {
        console.warn("Supabase query failed, falling back to products.json:", error.message);
      }
    } catch (err) {
      console.warn("Supabase client error, falling back to products.json:", err.message);
    }
  }

  return getFallbackProducts();
}

export default async function HomePage() {
  const products = await fetchProducts();

  return (
    <>
      <Nav />
      <main className="page">
        <div className="hero">
          <h1>Shop <span>TiiBaby</span> 🌸</h1>
          <p>Premium baby carriers, accessories &amp; bouncers — delivered with love 🇯🇲</p>
        </div>
        <ShopClient products={products} />
      </main>
    </>
  );
}
