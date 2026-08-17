"use client";
import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useCart } from "@/lib/CartContext";

const WA_PHONE = "18763405862";

function WaIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

export default function CartPage() {
  const { items, removeFromCart, updateQty, clearCart, total, itemCount } = useCart();
  const [ordering, setOrdering] = useState(false);

  const handleOrder = () => {
    if (!items.length) return;
    setOrdering(true);
    const lines = items.map(i => {
      const vParts = [];
      if (i.selectedColor) vParts.push(`Color: ${i.selectedColor.name}`);
      if (i.selectedSize) vParts.push(`Size: ${i.selectedSize}`);
      const vText = vParts.length > 0 ? ` | ${vParts.join(" | ")}` : "";
      return `• ${i.name} #${i.product_code}${vText} (x${i.qty}) — $${(Number(i.price) * i.qty).toLocaleString()} JMD`;
    });
    const msg = encodeURIComponent(`Hi TiiBaby! 🌸 I'd like to order:\n\n${lines.join("\n")}\n\nTotal: $${total.toLocaleString()} JMD`);
    clearCart();
    setOrdering(false);
    window.open(`https://wa.me/${WA_PHONE}?text=${msg}`, "_blank");
  };

  return (
    <>
      <Nav />
      <main className="page" style={{ paddingBottom: "6rem" }}>
        <h1 className="page-title">🛒 Your Cart</h1>

        {items.length === 0 ? (
          <div className="empty">
            <p style={{ fontSize: "2.5rem" }}>🛒</p>
            <p>Your cart is empty</p>
            <Link href="/" className="btn btn-pink" style={{ marginTop: "1rem", display: "inline-flex" }}>
              Browse Products
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "1rem", maxWidth: 680 }}>
            {items.map(item => {
              const key = item.cartKey || item.id;
              const hasColor = !!item.selectedColor;
              const hasSize = !!item.selectedSize;

              return (
                <div key={key} style={{ display: "flex", gap: "1rem", alignItems: "center", background: "#fff", borderRadius: 14, padding: ".85rem", boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
                  <img
                    src={item.image_path || item.image || "/placeholder.png"}
                    alt={item.name}
                    width={64} height={64}
                    onError={e => { e.target.src = "/placeholder.png"; }}
                    style={{ borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "#f3f4f6" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: ".95rem" }}>{item.name}</p>
                    <p style={{ fontSize: ".75rem", color: "#9ca3af" }}>#{item.product_code}</p>

                    {(hasColor || hasSize) && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {hasColor && (
                          <span style={{ fontSize: ".72rem", background: "#fff0f6", color: "#db2777", fontWeight: 700, padding: "2px 8px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.selectedColor.hex, border: "1px solid rgba(0,0,0,0.2)" }} />
                            {item.selectedColor.name}
                          </span>
                        )}
                        {hasSize && (
                          <span style={{ fontSize: ".72rem", background: "#eff6ff", color: "#2563eb", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                            Size: {item.selectedSize}
                          </span>
                        )}
                      </div>
                    )}

                    <p style={{ fontWeight: 700, color: "var(--pink)", fontSize: ".85rem", marginTop: 4 }}>${Number(item.price).toLocaleString()} JMD each</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: ".35rem", flexShrink: 0 }}>
                    <button onClick={() => updateQty(key, item.qty - 1)} style={{ width: 28, height: 28, borderRadius: 8, border: "2px solid var(--border)", background: "#fff", fontWeight: 800, cursor: "pointer", fontSize: "1rem" }}>−</button>
                    <span style={{ fontWeight: 800, minWidth: 22, textAlign: "center" }}>{item.qty}</span>
                    <button onClick={() => updateQty(key, item.qty + 1)} style={{ width: 28, height: 28, borderRadius: 8, border: "2px solid var(--border)", background: "#fff", fontWeight: 800, cursor: "pointer", fontSize: "1rem" }}>+</button>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontWeight: 800, color: "var(--teal)" }}>${(Number(item.price) * item.qty).toLocaleString()}</p>
                    <button onClick={() => removeFromCart(key)} style={{ fontSize: ".72rem", color: "#9ca3af", background: "none", border: "none", cursor: "pointer", marginTop: 2 }}>Remove</button>
                  </div>
                </div>
              );
            })}

            <div style={{ background: "#fff", borderRadius: 14, padding: "1.25rem", boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <span style={{ fontWeight: 700, color: "var(--muted)" }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                <span style={{ fontWeight: 800, fontSize: "1.25rem", color: "var(--pink)" }}>${total.toLocaleString()} JMD</span>
              </div>
              <p style={{ fontSize: ".78rem", color: "#9ca3af", marginBottom: ".75rem", textAlign: "center" }}>
                💡 Tap below — your full order is sent to TiiBaby via WhatsApp
              </p>
              <button className="btn btn-wa btn-full" onClick={handleOrder} disabled={ordering} style={{ fontSize: "1rem", padding: ".85rem" }}>
                <WaIcon />
                {ordering ? "Opening WhatsApp…" : `Order via WhatsApp — $${total.toLocaleString()} JMD`}
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
