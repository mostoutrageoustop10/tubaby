"use client";
import { useState, useEffect, useCallback } from "react";

const KEY = "tiibaby_wishlist";

export default function useWishlist() {
  const [ids, setIds] = useState(new Set());

  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setIds(new Set(JSON.parse(raw))); } catch {}
  }, []);

  const toggle = useCallback((productId) => {
    const sid = String(productId);
    setIds(prev => {
      const next = new Set(prev);
      next.has(sid) ? next.delete(sid) : next.add(sid);
      try { localStorage.setItem(KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const isWished = useCallback((productId) => ids.has(String(productId)), [ids]);
  return { wishlistIds: ids, toggle, isWished };
}
