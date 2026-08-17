-- ════════════════════════════════════════════════════════════════
-- TiiBaby Shop — Supabase Migration
-- Run once in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- ── Products ─────────────────────────────────────────────────────
create table if not exists public.products (
  id            bigserial       primary key,
  name          text            not null default 'New Product',
  product_code  text            not null unique,
  price         numeric         not null default 0,
  base_price    numeric,
  category      text            not null default 'Accessories',
  image_path    text            not null default '',
  in_stock      boolean         not null default true,
  featured      boolean         not null default false,
  source        text            not null default 'manual',
  description   text,
  created_at    timestamptz     not null default now(),
  updated_at    timestamptz     not null default now()
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- RLS: anyone can read, only service role can write
alter table public.products enable row level security;

create policy "Public read products"
  on public.products for select using (true);

create policy "Service role full access on products"
  on public.products for all using (auth.role() = 'service_role');

-- ── Seed data (your 4 products) ──────────────────────────────────
insert into public.products (name, product_code, price, base_price, category, image_path, featured, source, description)
values
  ('Infant-to-Toddler Rocker (Pink)', '68147',  5800, 3625, 'Toys & Bouncers', '/images/BOUNCER__5800__4_.webp',         false, 'filename', 'Colourful infant rocker that converts to a toddler seat, with hanging toys and vibration.'),
  ('Infant-to-Toddler Rocker (Teal)', '68144',  5800, 3625, 'Toys & Bouncers', '/images/BOUNCER__5800.webp',              false, 'filename', 'Teal owl-themed rocker with detachable toy bar, music, and vibration mode.'),
  ('Baby Turban Cap',                 '0021',   575,  230,  'Accessories',     '/images/BABY_TURBAN_CAP__0021__230.webp', false, 'filename', 'Soft stretch cotton turban caps available in a range of colours for newborns.'),
  ('Baby Carrier EN71',               'EN71-2', 1764, 980,  'Baby Carriers',   '/images/BABY_CARRIER_EN71-2___980.webp',  true,  'filename', 'EN71-certified ergonomic baby carrier with padded shoulder straps and adjustable waist belt.')
on conflict (product_code) do nothing;

-- ── Orders ───────────────────────────────────────────────────────
create table if not exists public.orders (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete set null,
  items       jsonb       not null default '[]',
  total       numeric     not null default 0,
  status      text        not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

-- Anyone (including guests) can INSERT an order
create policy "Anyone can create order"
  on public.orders for insert
  with check (true);

-- Users can only read their own orders
create policy "Users read own orders"
  on public.orders for select
  using (auth.uid() = user_id);

-- Service role has full access (admin panel)
create policy "Service role full access on orders"
  on public.orders for all
  using (auth.role() = 'service_role');

-- ── Wishlists ────────────────────────────────────────────────────
create table if not exists public.wishlists (
  user_id     uuid    references auth.users(id)    on delete cascade,
  product_id  bigint  references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.wishlists enable row level security;

create policy "Users manage own wishlist"
  on public.wishlists for all
  using (auth.uid() = user_id);
