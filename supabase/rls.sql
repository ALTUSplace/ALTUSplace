-- ══════════════════════════════════════════════════════════════════════════════
-- Row Level Security — ALTUSplace (comprehensive, all 27 public tables)
-- ══════════════════════════════════════════════════════════════════════════════
-- Run in the Supabase SQL editor as the `postgres` role, AFTER the drizzle
-- migrations. Idempotent — safe to re-run (drop policy if exists + create or
-- replace + revoke/grant are all repeatable).
--
-- AUTH MODEL
--   The app authenticates with its own cookie sessions (openId), not Supabase
--   Auth. Policies resolve the signed-in platform user id from the JWT claim
--   `request.jwt.claims ->> 'app_user_id'` via public.app_user_id(), and admin
--   status from users.role in ('admin','SUPER_ADMIN') via public.app_is_admin().
--   Nothing in the app issues those claims today; these policies are the
--   defense-in-depth layer (H-1): direct anon/authenticated access to the
--   database over PostgREST is closed except for the narrow paths granted
--   below.
--
-- BYPASSRLS CAVEAT (H-2)
--   FORCE ROW LEVEL SECURITY re-applies policies to the table owner, but roles
--   carrying the BYPASSRLS attribute ignore RLS entirely — FORCE included. On
--   Supabase both `postgres` and `service_role` carry BYPASSRLS, and the app's
--   pooled connection (DATABASE_URL -> postgres.<ref>) uses that path, so it
--   bypasses every policy here. H-2 fully closes only once the app connects
--   through a dedicated non-BYPASSRLS role and sets the user context per
--   request:
--       set local request.jwt.claims = '{"app_user_id": <id>}';
--   That is a follow-up application change (server/db.ts), not a SQL change.
--
-- WRITE PRINCIPLE
--   Direct client writes are limited to what the browser genuinely must do:
--     • partner_applications INSERT — always lands as status 'pending'
--     • users UPDATE — profile/consent columns only
--     • listings INSERT/UPDATE/DELETE — owner only
--     • notifications UPDATE — read_at only
--   Everything else (bookings, payments, KYC, escrow, disputes, …) is written
--   server-side through the pooled connection; the previous client write
--   policies for those tables were deliberately removed.
--
-- PUBLIC LISTING VISIBILITY
--   Mirrors server/constants/listingStatuses.ts PUBLIC_LISTING_STATUSES:
--   ('Published', 'Available', 'Approved'). One predicate per policy — edit in
--   both places (here and in the app constant) to narrow or expand.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── helpers ───────────────────────────────────────────────────────────────────

-- Signed-in platform user id, or null when the claim is absent.
create or replace function public.app_user_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id', '')::bigint;
$$;

revoke all on function public.app_user_id() from public;
grant execute on function public.app_user_id() to anon, authenticated, service_role;

-- True when the caller's users.role is an admin. SECURITY DEFINER so the lookup
-- works even though `users` is otherwise restricted to the caller's own row.
create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = public.app_user_id()
      and u.role in ('admin', 'SUPER_ADMIN')
  );
$$;

revoke all on function public.app_is_admin() from public;
grant execute on function public.app_is_admin() to authenticated, service_role;

-- ── legacy policies (previous supabase/rls.sql, hyphenated names) ─────────────
-- Dropped explicitly so re-running this file on a database that still carries
-- the old names converges to the policy set below.
drop policy if exists "users-select-own" on public.users;
drop policy if exists "users-update-own" on public.users;
drop policy if exists "listings-select-public" on public.listings;
drop policy if exists "listings-select-owner" on public.listings;
drop policy if exists "listings-insert-owner" on public.listings;
drop policy if exists "listings-update-owner" on public.listings;
drop policy if exists "listings-delete-owner" on public.listings;
drop policy if exists "bookings-select-renter" on public.bookings;
drop policy if exists "bookings-select-owner" on public.bookings;
drop policy if exists "bookings-insert-renter" on public.bookings;
drop policy if exists "bookings-update-renter" on public.bookings;
drop policy if exists "payments-select-payer" on public.payments;
drop policy if exists "payments-insert-payer" on public.payments;
drop policy if exists "invoices-select-payer" on public.invoices;
drop policy if exists "kyc-select-own" on public.kyc_submissions;
drop policy if exists "kyc-insert-own" on public.kyc_submissions;
drop policy if exists "escrow-select-participants" on public.escrow_ledger;
drop policy if exists "notifications-select-own" on public.notifications;
drop policy if exists "notifications-update-own" on public.notifications;

-- ── users ─────────────────────────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.users force row level security;

-- anon gets the public owner projection (id / name / logo) only; row access is
-- still gated by users_select_public_owner. authenticated reads its own row in
-- full and may update the profile/consent columns below.
revoke all on table public.users from anon, authenticated;
grant select ("id", "name", "agency_logo_url") on table public.users to anon;
grant select on table public.users to authenticated;
grant update ("name", "whatsapp_phone", "whatsapp_number", "commercial_register", "agency_name", "agency_city", "agency_phone", "agency_email", "agency_address", "agency_website", "agency_latitude", "agency_longitude", "agency_hours", "agency_logo_url", "legal_consent_version", "legal_consent_at") on table public.users to authenticated;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  to authenticated
  using (id = public.app_user_id());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  to authenticated
  using (id = public.app_user_id())
  with check (id = public.app_user_id());

-- Public owner projection: only owners of a publicly visible listing.
drop policy if exists "users_select_public_owner" on public.users;
create policy "users_select_public_owner"
  on public.users for select
  to anon
  using (
    exists (
      select 1
      from public.listings l
      where l.owner_id = users.id
        and l.status in ('Published', 'Available', 'Approved')
    )
  );

-- ── vendor_profiles ───────────────────────────────────────────────────────────
alter table public.vendor_profiles enable row level security;
alter table public.vendor_profiles force row level security;

revoke all on table public.vendor_profiles from anon, authenticated;
grant select on table public.vendor_profiles to authenticated;

drop policy if exists "vendor_profiles_select_own" on public.vendor_profiles;
create policy "vendor_profiles_select_own"
  on public.vendor_profiles for select
  to authenticated
  using (user_id = public.app_user_id());

-- ── partner_applications ──────────────────────────────────────────────────────
alter table public.partner_applications enable row level security;
alter table public.partner_applications force row level security;

-- Public submit path: insert-only, restricted to the applicant-supplied
-- columns (no status / admin_note / reviewed_at — those stay admin/server-side).
revoke all on table public.partner_applications from anon, authenticated;
grant insert ("type", "agency_name", "city", "phone", "email", "website", "contact_person", "fleet_size", "property_count", "description", "logo_url", "gallery_urls", "vehicles", "password_hash", "password_salt") on table public.partner_applications to anon, authenticated;
-- Admin review path: read everything except the applicant credentials, update
-- only the review outcome columns.
grant select ("id", "type", "status", "agency_name", "city", "phone", "email", "website", "contact_person", "fleet_size", "property_count", "description", "logo_url", "gallery_urls", "vehicles", "admin_note", "reviewed_at", "createdAt") on table public.partner_applications to authenticated;
grant update ("status", "admin_note", "reviewed_at") on table public.partner_applications to authenticated;

drop policy if exists "partner_applications_insert_public" on public.partner_applications;
create policy "partner_applications_insert_public"
  on public.partner_applications for insert
  to anon, authenticated
  with check (status = 'pending');

drop policy if exists "partner_applications_select_admin" on public.partner_applications;
create policy "partner_applications_select_admin"
  on public.partner_applications for select
  to authenticated
  using (public.app_is_admin());

drop policy if exists "partner_applications_update_admin" on public.partner_applications;
create policy "partner_applications_update_admin"
  on public.partner_applications for update
  to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

-- ── listings ──────────────────────────────────────────────────────────────────
alter table public.listings enable row level security;
alter table public.listings force row level security;

revoke all on table public.listings from anon, authenticated;
grant select on table public.listings to anon, authenticated;
grant insert, update, delete on table public.listings to authenticated;

-- Public marketplace reads: only statuses the app itself publishes.
drop policy if exists "listings_select_public" on public.listings;
create policy "listings_select_public"
  on public.listings for select
  to anon, authenticated
  using (status in ('Published', 'Available', 'Approved'));

-- Owner (incl. partner role — ownership is owner_id -> users.id) CRUD.
drop policy if exists "listings_insert_owner" on public.listings;
create policy "listings_insert_owner"
  on public.listings for insert
  to authenticated
  with check (owner_id = public.app_user_id());

-- with check blocks ownership transfer on update.
drop policy if exists "listings_update_owner" on public.listings;
create policy "listings_update_owner"
  on public.listings for update
  to authenticated
  using (owner_id = public.app_user_id())
  with check (owner_id = public.app_user_id());

drop policy if exists "listings_delete_owner" on public.listings;
create policy "listings_delete_owner"
  on public.listings for delete
  to authenticated
  using (owner_id = public.app_user_id());

-- ── bookings ──────────────────────────────────────────────────────────────────
alter table public.bookings enable row level security;
alter table public.bookings force row level security;

-- Read-only for clients; bookings are created/updated server-side only.
revoke all on table public.bookings from anon, authenticated;
grant select on table public.bookings to authenticated;

drop policy if exists "bookings_select_renter" on public.bookings;
create policy "bookings_select_renter"
  on public.bookings for select
  to authenticated
  using (renter_id = public.app_user_id());

-- Owner of the primary listing or of a bundle's secondary listing.
drop policy if exists "bookings_select_owner" on public.bookings;
create policy "bookings_select_owner"
  on public.bookings for select
  to authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = bookings.listing_id
        and l.owner_id = public.app_user_id()
    )
    or exists (
      select 1
      from public.listings l
      where l.id = bookings.secondary_listing_id
        and l.owner_id = public.app_user_id()
    )
  );

-- ── booking_messages ──────────────────────────────────────────────────────────
alter table public.booking_messages enable row level security;
alter table public.booking_messages force row level security;

revoke all on table public.booking_messages from anon, authenticated;
grant select on table public.booking_messages to authenticated;

drop policy if exists "booking_messages_select_participant" on public.booking_messages;
create policy "booking_messages_select_participant"
  on public.booking_messages for select
  to authenticated
  using (sender_id = public.app_user_id() or recipient_id = public.app_user_id());

-- ── booking_vouchers ──────────────────────────────────────────────────────────
alter table public.booking_vouchers enable row level security;
alter table public.booking_vouchers force row level security;

revoke all on table public.booking_vouchers from anon, authenticated;
grant select on table public.booking_vouchers to authenticated;

drop policy if exists "booking_vouchers_select_renter" on public.booking_vouchers;
create policy "booking_vouchers_select_renter"
  on public.booking_vouchers for select
  to authenticated
  using (renter_id = public.app_user_id());

-- ── payments ──────────────────────────────────────────────────────────────────
alter table public.payments enable row level security;
alter table public.payments force row level security;

revoke all on table public.payments from anon, authenticated;
grant select on table public.payments to authenticated;

drop policy if exists "payments_select_payer" on public.payments;
create policy "payments_select_payer"
  on public.payments for select
  to authenticated
  using (payer_id = public.app_user_id());

-- ── invoices ──────────────────────────────────────────────────────────────────
alter table public.invoices enable row level security;
alter table public.invoices force row level security;

revoke all on table public.invoices from anon, authenticated;
grant select on table public.invoices to authenticated;

drop policy if exists "invoices_select_payer" on public.invoices;
create policy "invoices_select_payer"
  on public.invoices for select
  to authenticated
  using (payer_id = public.app_user_id());

-- ── transactions ──────────────────────────────────────────────────────────────
alter table public.transactions enable row level security;
alter table public.transactions force row level security;

revoke all on table public.transactions from anon, authenticated;
grant select on table public.transactions to authenticated;

drop policy if exists "transactions_select_participant" on public.transactions;
create policy "transactions_select_participant"
  on public.transactions for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = transactions.booking_id
        and (
          b.renter_id = public.app_user_id()
          or exists (
            select 1
            from public.listings l
            where l.id = b.listing_id
              and l.owner_id = public.app_user_id()
          )
        )
    )
  );

-- ── escrow_ledger ─────────────────────────────────────────────────────────────
alter table public.escrow_ledger enable row level security;
alter table public.escrow_ledger force row level security;

revoke all on table public.escrow_ledger from anon, authenticated;
grant select on table public.escrow_ledger to authenticated;

drop policy if exists "escrow_ledger_select_participant" on public.escrow_ledger;
create policy "escrow_ledger_select_participant"
  on public.escrow_ledger for select
  to authenticated
  using (guest_id = public.app_user_id() or vendor_id = public.app_user_id());

-- ── refund_requests ───────────────────────────────────────────────────────────
alter table public.refund_requests enable row level security;
alter table public.refund_requests force row level security;

revoke all on table public.refund_requests from anon, authenticated;
grant select on table public.refund_requests to authenticated;

drop policy if exists "refund_requests_select_participant" on public.refund_requests;
create policy "refund_requests_select_participant"
  on public.refund_requests for select
  to authenticated
  using (
    requested_by = public.app_user_id()
    or exists (
      select 1
      from public.bookings b
      where b.id = refund_requests.booking_id
        and (
          b.renter_id = public.app_user_id()
          or exists (
            select 1
            from public.listings l
            where l.id = b.listing_id
              and l.owner_id = public.app_user_id()
          )
        )
    )
  );

-- ── disputes ──────────────────────────────────────────────────────────────────
alter table public.disputes enable row level security;
alter table public.disputes force row level security;

revoke all on table public.disputes from anon, authenticated;
grant select on table public.disputes to authenticated;

drop policy if exists "disputes_select_participant" on public.disputes;
create policy "disputes_select_participant"
  on public.disputes for select
  to authenticated
  using (
    opened_by = public.app_user_id()
    or exists (
      select 1
      from public.bookings b
      where b.id = disputes.booking_id
        and (
          b.renter_id = public.app_user_id()
          or exists (
            select 1
            from public.listings l
            where l.id = b.listing_id
              and l.owner_id = public.app_user_id()
          )
        )
    )
  );

-- ── dispute_attachments ───────────────────────────────────────────────────────
alter table public.dispute_attachments enable row level security;
alter table public.dispute_attachments force row level security;

revoke all on table public.dispute_attachments from anon, authenticated;
grant select on table public.dispute_attachments to authenticated;

-- Visible to participants of the booking behind the parent dispute.
drop policy if exists "dispute_attachments_select_participant" on public.dispute_attachments;
create policy "dispute_attachments_select_participant"
  on public.dispute_attachments for select
  to authenticated
  using (
    exists (
      select 1
      from public.disputes d
      join public.bookings b on b.id = d.booking_id
      where d.id = dispute_attachments.dispute_id
        and (
          b.renter_id = public.app_user_id()
          or exists (
            select 1
            from public.listings l
            where l.id = b.listing_id
              and l.owner_id = public.app_user_id()
          )
        )
    )
  );

-- ── reviews ───────────────────────────────────────────────────────────────────
alter table public.reviews enable row level security;
alter table public.reviews force row level security;

revoke all on table public.reviews from anon, authenticated;
grant select on table public.reviews to authenticated;

drop policy if exists "reviews_select_own" on public.reviews;
create policy "reviews_select_own"
  on public.reviews for select
  to authenticated
  using (user_id = public.app_user_id());

-- ── favorites ─────────────────────────────────────────────────────────────────
alter table public.favorites enable row level security;
alter table public.favorites force row level security;

revoke all on table public.favorites from anon, authenticated;
grant select on table public.favorites to authenticated;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
  on public.favorites for select
  to authenticated
  using (user_id = public.app_user_id());

-- ── listing_comments ──────────────────────────────────────────────────────────
alter table public.listing_comments enable row level security;
alter table public.listing_comments force row level security;

revoke all on table public.listing_comments from anon, authenticated;
grant select on table public.listing_comments to authenticated;

drop policy if exists "listing_comments_select_own" on public.listing_comments;
create policy "listing_comments_select_own"
  on public.listing_comments for select
  to authenticated
  using (author_id = public.app_user_id());

-- ── kyc_submissions ───────────────────────────────────────────────────────────
alter table public.kyc_submissions enable row level security;
alter table public.kyc_submissions force row level security;

revoke all on table public.kyc_submissions from anon, authenticated;
grant select on table public.kyc_submissions to authenticated;

drop policy if exists "kyc_submissions_select_own" on public.kyc_submissions;
create policy "kyc_submissions_select_own"
  on public.kyc_submissions for select
  to authenticated
  using (user_id = public.app_user_id());

-- ── support_tickets ───────────────────────────────────────────────────────────
alter table public.support_tickets enable row level security;
alter table public.support_tickets force row level security;

revoke all on table public.support_tickets from anon, authenticated;
grant select on table public.support_tickets to authenticated;

drop policy if exists "support_tickets_select_own" on public.support_tickets;
create policy "support_tickets_select_own"
  on public.support_tickets for select
  to authenticated
  using (user_id = public.app_user_id());

-- ── payout_requests ───────────────────────────────────────────────────────────
alter table public.payout_requests enable row level security;
alter table public.payout_requests force row level security;

revoke all on table public.payout_requests from anon, authenticated;
grant select on table public.payout_requests to authenticated;

drop policy if exists "payout_requests_select_own" on public.payout_requests;
create policy "payout_requests_select_own"
  on public.payout_requests for select
  to authenticated
  using (owner_id = public.app_user_id());

-- ── commercial_lease_contracts ────────────────────────────────────────────────
alter table public.commercial_lease_contracts enable row level security;
alter table public.commercial_lease_contracts force row level security;

revoke all on table public.commercial_lease_contracts from anon, authenticated;
grant select on table public.commercial_lease_contracts to authenticated;

drop policy if exists "commercial_lease_contracts_select_participant" on public.commercial_lease_contracts;
create policy "commercial_lease_contracts_select_participant"
  on public.commercial_lease_contracts for select
  to authenticated
  using (landlord_id = public.app_user_id() or tenant_id = public.app_user_id());

-- ── notifications ─────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
-- Only the read flag is client-writable.
grant update ("read_at") on table public.notifications to authenticated;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = public.app_user_id());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = public.app_user_id())
  with check (user_id = public.app_user_id());

-- ══════════════════════════════════════════════════════════════════════════════
-- Deny-all: platform-internal tables. RLS forced, no client grants, no
-- policies — the backend reaches them through its pooled connection.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── listing_analytics_events ──────────────────────────────────────────────────
alter table public.listing_analytics_events enable row level security;
alter table public.listing_analytics_events force row level security;
revoke all on table public.listing_analytics_events from anon, authenticated;

-- ── translations ──────────────────────────────────────────────────────────────
alter table public.translations enable row level security;
alter table public.translations force row level security;
revoke all on table public.translations from anon, authenticated;

-- ── audit_logs ────────────────────────────────────────────────────────────────
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
revoke all on table public.audit_logs from anon, authenticated;

-- ── platform_settings ─────────────────────────────────────────────────────────
alter table public.platform_settings enable row level security;
alter table public.platform_settings force row level security;
revoke all on table public.platform_settings from anon, authenticated;

-- ── commission_tiers ──────────────────────────────────────────────────────────
alter table public.commission_tiers enable row level security;
alter table public.commission_tiers force row level security;
revoke all on table public.commission_tiers from anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (optional, read-only — run after the script)
-- ══════════════════════════════════════════════════════════════════════════════
-- 1) Every public table must show rls = true AND forced = true (27 rows):
--
--    select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
--    from pg_class c
--    where c.relnamespace = 'public'::regnamespace
--      and c.relkind = 'r'
--    order by c.relname;
--
-- 2) Review the installed policies:
--
--    select tablename, policyname, cmd, roles
--    from pg_policies
--    where schemaname = 'public'
--    order by tablename, policyname;
-- ══════════════════════════════════════════════════════════════════════════════
