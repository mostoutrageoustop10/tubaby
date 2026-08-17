"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useCart } from "@/lib/CartContext";

export default function Nav() {
  const { itemCount }           = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-logo">Tii<span>Baby</span> 🌸</Link>

          <div className="nav-links nav-desktop">
            <Link href="/">Shop</Link>
            <Link href="/wishlist">❤️ Wishlist</Link>
            <Link href="/admin">Admin</Link>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:".6rem" }}>
            <Link href="/cart" style={{ position:"relative", display:"flex", alignItems:"center", padding:"4px" }}>
              <span style={{ fontSize:"1.3rem" }}>🛒</span>
              {itemCount > 0 && (
                <span style={{
                  position:"absolute", top:-2, right:-2,
                  background:"var(--pink)", color:"#fff",
                  fontSize:".6rem", fontWeight:800,
                  minWidth:16, height:16, borderRadius:"50%",
                  display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px"
                }}>{itemCount > 99 ? "99+" : itemCount}</span>
              )}
            </Link>
            <button onClick={() => setMobileOpen(o => !o)} className="nav-hamburger">
              {mobileOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div style={{ borderTop:"1px solid var(--border)", padding:".75rem 1rem", display:"flex", flexDirection:"column", gap:".25rem", background:"#fff" }}>
            {[
              { href:"/",        label:"🛍 Shop" },
              { href:"/wishlist",label:"❤️ Wishlist" },
              { href:"/cart",    label:"🛒 Cart" },
              { href:"/admin",   label:"⚙️ Admin" },
            ].map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)}
                style={{ padding:".6rem .5rem", fontWeight:700, fontSize:".95rem", color:"var(--text)" }}>
                {label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Mobile bottom nav */}
      <div className="mobile-bottom-nav">
        {[
          { href:"/",        icon:"🏠", label:"Shop" },
          { href:"/wishlist",icon:"❤️", label:"Saved" },
          { href:"/cart",    icon:"🛒", label:"Cart", badge: itemCount },
          { href:"/admin",   icon:"⚙️", label:"Admin" },
        ].map(({ href, icon, label, badge }) => (
          <Link key={href} href={href} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, position:"relative", padding:"4px 8px", color:"var(--muted)", fontSize:".65rem", fontWeight:700, textDecoration:"none" }}>
            <span style={{ fontSize:"1.2rem" }}>{icon}</span>
            {badge > 0 && (
              <span style={{ position:"absolute", top:0, right:0, background:"var(--pink)", color:"#fff", fontSize:".55rem", fontWeight:800, minWidth:14, height:14, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", padding:"0 2px" }}>{badge}</span>
            )}
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}
