import Nav        from "@/components/Nav";
import ShopClient from "@/components/ShopClient";
import { getAllProducts, FALLBACK_PRODUCTS } from "@/lib/products";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  let products;
  try { products = await getAllProducts(); }
  catch { products = FALLBACK_PRODUCTS; }
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
