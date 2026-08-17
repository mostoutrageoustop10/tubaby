"use client";
import { useState, useMemo } from "react";
import ProductCard from "./ProductCard";
import { useCart } from "@/lib/CartContext";
import useWishlist from "@/lib/useWishlist";

const CATEGORIES = ["All", "Baby Carriers", "Accessories", "Toys & Bouncers"];

export default function ShopClient({ products }) {
  const [search,   setSearch]   = useState("");
  const [category, setCategory] = useState("All");
  const [hideOOS,  setHideOOS]  = useState(false);
  const [toast,    setToast]    = useState(null);

  const { addToCart }          = useCart();
  const { toggle, isWished }   = useWishlist();

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const handleAddToCart = (product) => { addToCart(product); showToast(`🛒 Added to cart`); };

  const filtered = useMemo(() => products.filter(p => {
    if (hideOOS && !(p.in_stock ?? true)) return false;
    if (category !== "All" && p.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || String(p.product_code).toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    }
    return true;
  }), [products, search, category, hideOOS]);

  return (
    <>
      {toast && (
        <div style={{ position:"fixed", bottom:72, left:"50%", transform:"translateX(-50%)", background:"#1e1b2e", color:"#fff", padding:".65rem 1.25rem", borderRadius:12, fontWeight:700, fontSize:".9rem", zIndex:999, boxShadow:"0 4px 20px rgba(0,0,0,.25)", whiteSpace:"nowrap" }}>{toast}</div>
      )}
      <div className="controls">
        <div className="search-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18a7.5 7.5 0 006.15-1.35z" />
          </svg>
          <input className="search-input" placeholder="Search products or codes…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="filter-tabs">
          {CATEGORIES.map(cat => (
            <button key={cat} className={`filter-tab ${category === cat ? "active" : ""}`} onClick={() => setCategory(cat)}>{cat}</button>
          ))}
        </div>
        <label className="stock-toggle">
          <input type="checkbox" checked={hideOOS} onChange={e => setHideOOS(e.target.checked)} />
          In-stock only
        </label>
      </div>
      {filtered.length === 0 ? (
        <div className="empty"><p>No products found 😢</p></div>
      ) : (
        <div className="product-grid">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} onAddToCart={handleAddToCart} onWishlist={toggle} isWished={isWished(p.id)} />
          ))}
        </div>
      )}
      <p style={{ marginTop:"1.5rem", fontSize:".8rem", color:"#9ca3af", textAlign:"center" }}>
        Showing {filtered.length} of {products.length} products
      </p>
    </>
  );
}
