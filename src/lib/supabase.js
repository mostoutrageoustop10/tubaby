// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = (URL && ANON)
  ? createClient(URL, ANON, { auth: { persistSession: true } })
  : null;

export const supabaseAdmin = (URL && (SVC || ANON))
  ? createClient(URL, SVC || ANON, { auth: { persistSession: false } })
  : null;

