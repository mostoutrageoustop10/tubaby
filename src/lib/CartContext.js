// src/lib/CartContext.js
"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const CartContext = createContext(null);
const KEY = "tiibaby_cart";

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setItems(JSON.parse(raw)); } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  }, [items, hydrated]);

  const addToCart = useCallback((product, qty = 1, variants = {}) => {
    const selectedColor = variants.selectedColor || product.selectedColor || null;
    const selectedSize = variants.selectedSize || product.selectedSize || null;
    const cartKey = `${product.id}-${selectedColor?.name || ""}-${selectedSize || ""}`;

    setItems(prev => {
      const idx = prev.findIndex(i => (i.cartKey || String(i.id)) === cartKey);
      if (idx >= 0) {
        const n = [...prev];
        n[idx] = { ...n[idx], qty: n[idx].qty + qty };
        return n;
      }
      return [...prev, { ...product, qty, selectedColor, selectedSize, cartKey }];
    });
  }, []);

  const removeFromCart = useCallback((keyOrId) => {
    setItems(prev => prev.filter(i => (i.cartKey || String(i.id)) !== String(keyOrId)));
  }, []);

  const updateQty = useCallback((keyOrId, qty) => {
    if (qty <= 0) {
      removeFromCart(keyOrId);
      return;
    }
    setItems(prev => prev.map(i => (i.cartKey || String(i.id)) === String(keyOrId) ? { ...i, qty } : i));
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setItems([]);
    try { localStorage.removeItem(KEY); } catch {}
  }, []);

  const total = items.reduce((s, i) => s + Number(i.price) * i.qty, 0);
  const itemCount = items.reduce((s, i) => s + i.qty, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQty, clearCart, total, itemCount, hydrated }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
