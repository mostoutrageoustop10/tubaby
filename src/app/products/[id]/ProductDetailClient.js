"use client";
import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import ProductCard from "@/components/ProductCard";
import { useCart } from "@/lib/CartContext";
import useWishlist from "@/lib/useWishlist";

const WA_PHONE = "18763405862";

export default function ProductDetailClient({ initialProduct, initialBundles = [] }) {
  const { addToCart } = useCart();
  const { toggle, isWished } = useWishlist();

  const product = initialProduct;
  const bundles = initialBundles;

  const [activeImage, setActiveImage] = useState(product?.image_path || product?.image || "/placeholder.png");
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <>
        <Nav />
        <main className="page">
          <div className="empty">
            <p>Product not found</p>
            <Link href="/" className="btn btn-pink" style={{ marginTop: "1rem", display: "inline-flex" }}>
              Back to Shop
            </Link>
          </div>
        </main>
      </>
    );
  }

  const isInStock = product.in_stock ?? true;
  const hasPrice = product.price && Number(product.price) > 0;
  const displayPrice = hasPrice ? `$${Number(product.price).toLocaleString()} JMD` : "Price coming soon";

  // Variant Display Rules
  const colors = product.colors || [];
  const sizes = product.sizes || [];

  const shouldShowColors = (product.showColorSelector ?? (colors.length > 0)) && colors.length > 0;
  const shouldShowSizes = (product.showSizeSelector ?? (sizes.length > 0)) && sizes.length > 0;

  // Multiple Images list
  const allImages = Array.from(new Set([
    product.image_path,
    product.image,
    ...(product.images || [])
  ])).filter(Boolean);

  // Format WhatsApp Payload
  const buildWaUrl = () => {
    const variantParts = [];
    if (shouldShowColors && selectedColor) {
      variantParts.push(`Color: ${selectedColor.name}`);
    }
    if (shouldShowSizes && selectedSize) {
      variantParts.push(`Size: ${selectedSize}`);
    }

    let itemInfo = `Item: ${product.name} #${product.product_code}`;
    if (variantParts.length > 0) {
      itemInfo += ` | ${variantParts.join(" | ")}`;
    }

    const msg = `Hi TiiBaby! 🌸 I'd like to order:\n${itemInfo}\nPrice: ${displayPrice}`;
    return `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(msg)}`;
  };

  const handleAddToCart = () => {
    if (!product) return;
    addToCart(product, 1, {
      selectedColor: shouldShowColors ? selectedColor : null,
      selectedSize: shouldShowSizes ? selectedSize : null,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <>
      <Nav />
      <main className="page" style={{ paddingBottom: "6rem" }}>
        <div className="breadcrumb">
          <Link href="/">Shop</Link>
          <span>›</span>
          <span>{product.category}</span>
          <span>›</span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>{product.name}</span>
        </div>

        <div className="detail-grid">
          {/* Images Section */}
          <div style={{ position: "relative" }}>
            <div className="detail-img">
              <img
                src={activeImage}
                alt={product.name}
                onError={e => { e.target.src = "/placeholder.png"; }}
              />
            </div>

            {/* Thumbnail Gallery if multiple images */}
            {allImages.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
                {allImages.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt=""
                    onClick={() => setActiveImage(img)}
                    style={{
                      width: 60, height: 60, borderRadius: 8, objectFit: "cover", cursor: "pointer",
                      border: activeImage === img ? "2px solid var(--pink)" : "2px solid transparent",
                      opacity: activeImage === img ? 1 : 0.7
                    }}
                  />
                ))}
              </div>
            )}

            <button
              onClick={() => toggle(product.id)}
              aria-label="Wishlist"
              style={{
                position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,.92)",
                border: "none", borderRadius: "50%", width: 40, height: 40, fontSize: "1.2rem",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,.12)"
              }}
            >
              {isWished(product.id) ? "❤️" : "🤍"}
            </button>
          </div>

          {/* Info & Variants Section */}
          <div className="detail-info">
            <span className="detail-cat">{product.category}</span>
            <h1 className="detail-name">{product.name}</h1>
            <span className="detail-code">Code: #{product.product_code}</span>

            {product.description && (
              <p style={{ fontSize: ".95rem", color: "#4b5563", lineHeight: 1.7, marginTop: 8 }}>
                {product.description}
              </p>
            )}

            <div className="detail-price">{displayPrice}</div>

            {!isInStock && (
              <div style={{ padding: ".75rem 1rem", background: "#fee2e2", borderRadius: 10, fontWeight: 700, color: "#991b1b" }}>
                ⚠️ Currently out of stock
              </div>
            )}

            {/* COLOR SELECTOR (Strictly rendered based on display rule) */}
            {shouldShowColors && (
              <div style={{ marginTop: "1rem", background: "#fafafa", padding: "1rem", borderRadius: 12, border: "1px solid #f3f4f6" }}>
                <label style={{ display: "block", fontSize: ".88rem", fontWeight: 800, marginBottom: ".6rem", color: "#374151" }}>
                  Color: <span style={{ color: "var(--pink)", fontWeight: 700 }}>{selectedColor ? selectedColor.name : "Select Option"}</span>
                </label>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {colors.map((color, idx) => {
                    const isAvailable = color.inStock !== false;
                    const isSelected = selectedColor?.name === color.name;

                    return (
                      <button
                        key={idx}
                        disabled={!isAvailable}
                        onClick={() => setSelectedColor(color)}
                        title={!isAvailable ? `${color.name} (Out of Stock)` : color.name}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                          borderRadius: 20, border: isSelected ? "2px solid var(--pink)" : "1px solid #d1d5db",
                          background: isSelected ? "#fff0f6" : "#ffffff",
                          cursor: isAvailable ? "pointer" : "not-allowed",
                          opacity: isAvailable ? 1 : 0.45,
                          position: "relative", overflow: "hidden",
                          transition: "all .2s"
                        }}
                      >
                        <span
                          style={{
                            width: 18, height: 18, borderRadius: "50%",
                            background: color.hex, border: "1px solid rgba(0,0,0,0.15)",
                            position: "relative"
                          }}
                        />
                        <span style={{ fontSize: ".82rem", fontWeight: 700, textDecoration: !isAvailable ? "line-through" : "none", color: isAvailable ? "#1f2937" : "#9ca3af" }}>
                          {color.name}
                        </span>
                        {!isAvailable && (
                          <span style={{ fontSize: ".7rem", color: "#dc2626", fontWeight: 800 }}>
                            (OOS)
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SIZE SELECTOR (Strictly rendered based on display rule) */}
            {shouldShowSizes && (
              <div style={{ marginTop: "1rem", background: "#fafafa", padding: "1rem", borderRadius: 12, border: "1px solid #f3f4f6" }}>
                <label style={{ display: "block", fontSize: ".88rem", fontWeight: 800, marginBottom: ".6rem", color: "#374151" }}>
                  Size: <span style={{ color: "var(--pink)", fontWeight: 700 }}>{selectedSize || "Select Option"}</span>
                </label>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {sizes.map((sz, idx) => {
                    const isSelected = selectedSize === sz;

                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedSize(sz)}
                        style={{
                          padding: "6px 14px", borderRadius: 8,
                          border: isSelected ? "2px solid var(--pink)" : "1px solid #d1d5db",
                          background: isSelected ? "var(--pink)" : "#ffffff",
                          color: isSelected ? "#ffffff" : "#1f2937",
                          fontWeight: 800, fontSize: ".85rem", cursor: "pointer",
                          transition: "all .2s"
                        }}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            {isInStock && hasPrice && (
              <div className="detail-actions" style={{ marginTop: "1.5rem" }}>
                <button
                  onClick={handleAddToCart}
                  className="btn btn-pink"
                  style={{ flex: 1, padding: ".9rem", fontSize: "1rem" }}
                >
                  {added ? "✅ Added to Cart!" : "🛒 Add to Cart"}
                </button>

                <a
                  href={buildWaUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-wa"
                  style={{ flex: 1, padding: ".9rem", fontSize: "1rem" }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp Order
                </a>
              </div>
            )}

            <Link href="/" className="btn btn-outline" style={{ textAlign: "center", marginTop: "1rem" }}>
              ← Continue Shopping
            </Link>
          </div>
        </div>

        {/* Bundles Section */}
        {bundles.length > 0 && (
          <div className="bundle-section" style={{ marginTop: "3rem" }}>
            <h2>🎁 Bundle it with <span>these picks</span></h2>
            <div className="bundle-grid">
              {bundles.map(b => (
                <ProductCard
                  key={b.id}
                  product={b}
                  onAddToCart={() => addToCart(b)}
                  onWishlist={toggle}
                  isWished={isWished(b.id)}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
