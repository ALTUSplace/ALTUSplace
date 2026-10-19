-- ══════════════════════════════════════════════════════════════════════════════
-- Drop legacy template tables — ALTUSplace (cars, products, profiles)
-- ══════════════════════════════════════════════════════════════════════════════
-- Run in the Supabase SQL editor as the `postgres` role. Idempotent.
-- Executed against production on 2026-10-19 (verified: 0 legacy tables remain).
--
-- These three tables are template leftovers: not in drizzle/schema.ts, not
-- referenced by server/ or client/ code, and outside the 27-table scope of
-- supabase/rls.sql. products/profiles still carried old permissive template
-- policies, so they were pure attack surface.
--
-- Pre-flight (verified against production, 2026-10-19):
--   · no foreign keys or views depend on any of the three tables
--   · products = 0 rows, profiles = 0 rows, cars = 4 rows
--   · CASCADE is therefore belt-and-braces only
--
-- Final state after running: 27 public tables, all with RLS enabled + forced.

drop table if exists public.cars cascade;
drop table if exists public.products cascade;
drop table if exists public.profiles cascade;

-- Verification (expect 0 rows)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('cars', 'products', 'profiles');
