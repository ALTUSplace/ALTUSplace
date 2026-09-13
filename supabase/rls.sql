-- ── Row Level Security — ALTUSplace ───────────────────────────────────────────
-- Run this file in the Supabase SQL editor (or via psql) after applying the
-- drizzle migrations. It is composed so it can be re-run safely.
--
-- Integration notes:
--  • The app authenticates with its own cookie sessions (openId), not Supabase
--    Auth. Service-role / anon requests bypass nothing here; a helper resolves
--    the platform user id from the JWT claim `app_user_id`.
--  • Pass that claim when issuing client tokens so policies compare against
--    numeric primary keys (users.id / owner_id / renter_id / payer_id / user_id).
--  • An admin endpoint can also issue per-request service tokens; Supabase
--    service role continues to bypass RLS for server-side cron jobs.

-- Resolve the signed-in platform user id from the request JWT.
create or replace function public.app_user_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id', '')::bigint;
$$;

grant execute on function public.app_user_id() to anon, authenticated, service_role;

-- ── users ────────────────────────────────────────────────────────────────────
alter table public.users enable row level security;

drop policy if exists "users-select-own" on public.users;
create policy "users-select-own"
  on public.users for select
  to authenticated
  using (id = app_user_id());

drop policy if exists "users-update-own" on public.users;
create policy "users-update-own"
  on public.users for update
  to authenticated
  using (id = app_user_id())
  with check (id = app_user_id());

-- ── listings ─────────────────────────────────────────────────────────────────
alter table public.listings enable row level security;

drop policy if exists "listings-select-public" on public.listings;
create policy "listings-select-public"
  on public.listings for select
  to anon, authenticated
  using (status in ('Published', 'Available', 'Approved'));

drop policy if exists "listings-select-owner" on public.listings;
create policy "listings-select-owner"
  on public.listings for select
  to authenticated
  using (owner_id = app_user_id());

drop policy if exists "listings-insert-owner" on public.listings;
create policy "listings-insert-owner"
  on public.listings for insert
  to authenticated
  with check (owner_id = app_user_id());

drop policy if exists "listings-update-owner" on public.listings;
create policy "listings-update-owner"
  on public.listings for update
  to authenticated
  using (owner_id = app_user_id())
  with check (owner_id = app_user_id());

drop policy if exists "listings-delete-owner" on public.listings;
create policy "listings-delete-owner"
  on public.listings for delete
  to authenticated
  using (owner_id = app_user_id());

-- ── bookings ─────────────────────────────────────────────────────────────────
alter table public.bookings enable row level security;

drop policy if exists "bookings-select-renter" on public.bookings;
create policy "bookings-select-renter"
  on public.bookings for select
  to authenticated
  using (renter_id = app_user_id());

drop policy if exists "bookings-select-owner" on public.bookings;
create policy "bookings-select-owner"
  on public.bookings for select
  to authenticated
  using (
    exists (select 1 from public.listings l where l.id = bookings.listing_id and l.owner_id = app_user_id())
  );

drop policy if exists "bookings-insert-renter" on public.bookings;
create policy "bookings-insert-renter"
  on public.bookings for insert
  to authenticated
  with check (renter_id = app_user_id());

drop policy if exists "bookings-update-renter" on public.bookings;
create policy "bookings-update-renter"
  on public.bookings for update
  to authenticated
  using (renter_id = app_user_id())
  with check (renter_id = app_user_id());

-- ── payments ──────────────────────────────────────────────────────────────────
alter table public.payments enable row level security;

drop policy if exists "payments-select-payer" on public.payments;
create policy "payments-select-payer"
  on public.payments for select
  to authenticated
  using (payer_id = app_user_id());

drop policy if exists "payments-insert-payer" on public.payments;
create policy "payments-insert-payer"
  on public.payments for insert
  to authenticated
  with check (payer_id = app_user_id());

-- ── invoices ──────────────────────────────────────────────────────────────────
alter table public.invoices enable row level security;

drop policy if exists "invoices-select-payer" on public.invoices;
create policy "invoices-select-payer"
  on public.invoices for select
  to authenticated
  using (payer_id = app_user_id());

-- ── kyc_submissions ───────────────────────────────────────────────────────────
alter table public.kyc_submissions enable row level security;

drop policy if exists "kyc-select-own" on public.kyc_submissions;
create policy "kyc-select-own"
  on public.kyc_submissions for select
  to authenticated
  using (user_id = app_user_id());

drop policy if exists "kyc-insert-own" on public.kyc_submissions;
create policy "kyc-insert-own"
  on public.kyc_submissions for insert
  to authenticated
  with check (user_id = app_user_id());

-- ── escrow_ledger ─────────────────────────────────────────────────────────────
alter table public.escrow_ledger enable row level security;

drop policy if exists "escrow-select-participants" on public.escrow_ledger;
create policy "escrow-select-participants"
  on public.escrow_ledger for select
  to authenticated
  using (
    guest_id = app_user_id()
    or vendor_id = app_user_id()
  );

-- ── notifications ─────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;

drop policy if exists "notifications-select-own" on public.notifications;
create policy "notifications-select-own"
  on public.notifications for select
  to authenticated
  using (user_id = app_user_id());

drop policy if exists "notifications-update-own" on public.notifications;
create policy "notifications-update-own"
  on public.notifications for update
  to authenticated
  using (user_id = app_user_id())
  with check (user_id = app_user_id());