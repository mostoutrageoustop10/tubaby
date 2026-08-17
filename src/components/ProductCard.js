// src/components/ProductCard.js
"use client";
import Link from "next/link";

export default function ProductCard({ product, onAddToCart, onWishlist, isWished }) {
  const { id, name, price, product_code, category, image_path, image, in_stock, stock, featured } = product;

  let imgSrc = "/placeholder.png";
  const rawImage = image_path || image;

  if (rawImage) {
    let sanitized = rawImage.trim().replace(/\s+/g, "_");
    if (!/\.\w+$/.test(sanitized)) {
      sanitized += ".webp";
    }
    if (!sanitized.startsWith("/")) {
      sanitized = `/images/${sanitized}`;
    }
    imgSrc = sanitized;
  } else if (product_code) {
    imgSrc = `/images/${product_code}.webp`;
  }

  const isInStock = in_stock ?? stock ?? true;
  const hasPrice  = price && Number(price) > 0;

  return (
    <div key={id} className={`product-card ${!isInStock ? "out-of-stock" : ""}`} style={{ position: "relative" }}>
      {/* Wishlist heart */}
      {onWishlist && (
        <button
          onClick={e => { e.preventDefault(); onWishlist(id); }}
          style={{
            position: "absolute", top: 8, right: 8, zIndex: 3,
            background: "rgba(255,255,255,0.9)", border: "none",
            borderRadius: "50%", width: 30, height: 30, fontSize: "0.9rem",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >{isWished ? "❤️" : "🤍"}</button>
      )}

      {featured && (
        <div style={{
          position: "absolute", top: 8, left: 8, zIndex: 2,
          background: "#fbbf24", color: "#92400e", fontSize: "0.62rem",
          fontWeight: 800, padding: "2px 7px", borderRadius: 8,
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>⭐ Featured</div>
      )}

      <Link href={`/products/${id}`}>
        <div className="card-img-wrap">
          <img src={imgSrc} alt={name} loading="lazy" width={400} height={400} />
          {!isInStock && <span className="card-badge oos">Out of Stock</span>}
          {isInStock && hasPrice && <span className="card-badge">In Stock</span>}
        </div>
        <div className="card-body">
          <span className="card-cat">{category}</span>
          <p className="card-name">{name}</p>
          <p className="card-code">#{product_code}</p>
          <p className="card-price">
            {hasPrice
              ? `$${Number(price).toLocaleString()} JMD`
              : <span style={{ color:"#f59e0b", fontSize:"0.85rem" }}>Price TBD</span>}
          </p>
        </div>
      </Link>

      {/* Add to cart */}
      {onAddToCart && isInStock && hasPrice && (
        <div style={{ padding: "0 0.85rem 0.85rem" }}>
          <button
            onClick={() => onAddToCart(product)}
            className="btn btn-pink btn-sm btn-full"
          >🛒 Add to Cart</button>
        </div>
      )}
    </div>
  );
}
