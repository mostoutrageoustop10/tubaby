"use client";
import { useState, useEffect } from "react";

export default function useUser() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only activate if Supabase is configured
    const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!URL || !ANON) { setLoading(false); return; }

    import("@supabase/supabase-js").then(({ createClient }) => {
      const sb = createClient(URL, ANON);
      sb.auth.getUser().then(({ data }) => { setUser(data?.user ?? null); setLoading(false); });
      const { data: { subscription } } = sb.auth.onAuthStateChange((_e, session) => {
        setUser(session?.user ?? null);
      });
      return () => subscription.unsubscribe();
    }).catch(() => setLoading(false));
  }, []);

  return { user, loading };
}
