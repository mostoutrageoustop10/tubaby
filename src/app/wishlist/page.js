"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Nav         from "@/components/Nav";
import ProductCard from "@/components/ProductCard";
import { useCart } from "@/lib/CartContext";
import useWishlist from "@/lib/useWishlist";

export default function WishlistPage() {
  const { addToCart }           = useCart();
  const { wishlistIds, toggle } = useWishlist();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setProducts(data);
    }).catch(() => {});
  }, []);

  const wished = products.filter(p => wishlistIds.has(String(p.id)));

  return (
    <>
      <Nav />
      <main className="page" style={{ paddingBottom:"6rem" }}>
        <h1 className="page-title">❤️ Wishlist</h1>
        {wished.length === 0 ? (
          <div className="empty">
            <p style={{ fontSize:"2rem", marginBottom:".5rem" }}>🤍</p>
            <p>Nothing saved yet</p>
            <Link href="/" className="btn btn-pink" style={{ marginTop:"1rem", display:"inline-flex" }}>
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {wished.map(p => (
              <ProductCard key={p.id} product={p}
                onAddToCart={addToCart}
                onWishlist={toggle}
                isWished={true}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
