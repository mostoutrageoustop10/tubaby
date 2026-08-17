// src/lib/supabase.js
// Supabase is optional. App works fully without it.
// When keys are added later, Google login and order history activate automatically.

let supabase      = null;
let supabaseAdmin = null;

try {
  const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (URL && ANON) {
    const { createClient } = require("@supabase/supabase-js");
    supabase      = createClient(URL, ANON, { auth: { persistSession: true } });
    supabaseAdmin = createClient(URL, SVC || ANON, { auth: { persistSession: false } });
  }
} catch {}

export { supabase, supabaseAdmin };
