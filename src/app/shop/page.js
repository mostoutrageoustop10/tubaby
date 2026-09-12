import fs from "fs";
import path from "path";
import Nav from "@/components/Nav";
import ShopClient from "@/components/ShopClient";
import { getAllProducts } from "@/lib/products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getFallbackProducts() {
  try {
    const jsonPath = path.join(process.cwd(), "public", "products.json");
    if (fs.existsSync(jsonPath)) {
      const fileData = fs.readFileSync(jsonPath, "utf-8");
      const products = JSON.parse(fileData);
      if (Array.isArray(products) && products.length > 0) {
        return products.map((p, idx) => {
          const code = p.product_code || p.code || `ACC-${idx + 1}`;
          const slug = p.slug || (p.name ? p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : String(p.id || idx + 1));
          return {
            id: p.id || String(idx + 1),
            name: p.name || "Unnamed Product",
            product_code: code,
            code,
            slug,
            price: Number(p.price) || 0,
            category: p.category || "Accessories",
            image_path: p.image_path || p.image || p.image_url || "/placeholder.png",
            image: p.image_path || p.image || p.image_url || "/placeholder.png",
            image_url: p.image_path || p.image || p.image_url || "/placeholder.png",
            in_stock: p.in_stock !== undefined ? Boolean(p.in_stock) : true,
            featured: Boolean(p.featured),
            colors: p.colors || [],
            description: p.description || null,
            meta_title: p.meta_title || (p.name ? `${p.name} | TiiBaby Shop Jamaica` : null),
            needs_review: Boolean(p.needs_review),
            variants: p.variants || [],
            images: Array.isArray(p.images) ? p.images : (p.image_path ? [p.image_path] : [])
          };
        });
      }
    }
  } catch (err) {
    console.error("Error reading fallback products.json:", err);
  }
  return [];
}

async function fetchProducts() {
  try {
    const products = await getAllProducts();
    if (Array.isArray(products) && products.length > 0) {
      return products;
    }
  } catch (err) {
    console.warn("Supabase fetch failed, falling back to products.json:", err.message);
  }

  return getFallbackProducts();
}

export default async function ShopPage() {
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
