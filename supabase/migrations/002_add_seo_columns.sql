-- ════════════════════════════════════════════════════════════════
-- TiiBaby Shop — Migration 002: Add SEO & Catalog columns
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS meta_title text,
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS colors jsonb DEFAULT '[]'::jsonb;

-- Create index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
