-- ResumeForge — Initial Schema Migration
-- Task 6.1: Schema migrations for account metadata tables.
--
-- Scope of THIS migration: table definitions only (CREATE TABLE + constraints).
--   * RLS policies are added in a later migration (Task 6.2).
--   * Security-definer RPCs (consume_download, approve_payment, reject_payment,
--     set_free_forever) are added in a later migration (Task 6.3).
--
-- Design reference: design.md > "Data Models > Supabase Schema".
--
-- IMPORTANT (RLS): This migration deliberately does NOT enable Row Level
-- Security. Enabling RLS without any policies would lock every table (deny-all),
-- breaking the app until 6.2 runs. Task 6.2 is responsible for BOTH
-- `alter table ... enable row level security;` AND the accompanying policies,
-- so that enablement and policy creation land together and tables are never
-- left locked-without-policies. See design.md > "RLS Policy Summary".
--
-- Target: PostgreSQL as provided by Supabase (uses gen_random_uuid(),
-- the auth.users table, and timestamptz).

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users. Holds tamper-proof account metadata.
-- Requirements: 7.4 (profile fields on signup), 12.2 (account metadata only).
-- NOTE: A profiles row is created on signup by the auth flow (Task 7); this
--       migration only defines the table shape.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  display_name       text,
  created_at         timestamptz default now(),
  last_login_at      timestamptz,
  free_downloads_used int not null default 0,   -- shared free counter (Req 8.3, 8.4); mutated via RPC (Task 6.3)
  is_free_forever    boolean not null default false  -- admin-only override (Req 8.2); set via RPC (Task 6.3)
);

-- ---------------------------------------------------------------------------
-- products: purchasable unlock types (e.g. 'resume_only',
--           'resume_plus_cover_letter').
-- Requirements: 8.7 (product types with price / unlocks_count / active).
-- ---------------------------------------------------------------------------
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  price         numeric not null,
  unlocks_count int not null default 1,
  active        boolean not null default true
);

-- ---------------------------------------------------------------------------
-- user_credits: per-product unlocked-download balances.
-- Requirements: 8.8 (track per-product credits).
-- Composite PK (user_id, product_id) => at most one balance row per pair.
-- ---------------------------------------------------------------------------
create table if not exists user_credits (
  user_id           uuid references profiles(id) on delete cascade,
  product_id        uuid references products(id) on delete cascade,
  credits_remaining int not null default 0,
  primary key (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- payment_requests: user-claimed UPI payments pending manual admin verify.
-- Requirements: 9.2 (payment request record), 10.2 (admin-managed).
-- status is constrained to the design's allowed values; only an admin may
-- move it away from 'pending' (enforced by RLS/RPC in 6.2/6.3). The CHECK
-- constraint backs the design's "status monotonicity" property (Property 6,
-- Req 10.6/10.7) by rejecting any out-of-domain status value.
-- ---------------------------------------------------------------------------
create table if not exists payment_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete cascade,
  product_id     uuid references products(id),
  amount_claimed numeric not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  requested_at   timestamptz default now(),
  approved_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- payment_settings: global, admin-editable UPI settings. Single-row table
-- (id defaults to 1). Publicly readable, admin-only writable (RLS in 6.2).
-- Requirements: 9.2 (upi_id + note source), 10.2 (admin-managed).
-- ---------------------------------------------------------------------------
create table if not exists payment_settings (
  id     int primary key default 1,
  upi_id text not null,
  note   text
);

-- ---------------------------------------------------------------------------
-- admins: allow-list of users with admin-panel access. Seeded manually by
-- the operator (see supabase/seed.sql).
-- Requirements: 10.2 (admin gating).
-- ---------------------------------------------------------------------------
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- resumes (OPTIONAL v1 nice-to-have): cross-device resume sync store.
-- Requirements: 12.2 (RLS-scoped per-user sync). Resume content otherwise
-- stays in the browser; this table is only used if the user opts into sync.
-- ---------------------------------------------------------------------------
create table if not exists resumes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz default now()
);
