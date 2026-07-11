-- ResumeForge — Row Level Security (RLS) Policies Migration
-- Task 6.2: Enable RLS and add policies per the design's "RLS Policy Summary".
--
-- Scope of THIS migration:
--   * `alter table ... enable row level security;` for EVERY app table.
--   * The read/write policies that match the design's policy matrix.
--   * A recursion-safe `is_admin()` helper and a column-immutability trigger
--     on `profiles` (protecting is_free_forever / free_downloads_used).
--
-- Out of scope (Task 6.3, next migration 0003): the security-definer RPCs
--   (consume_download, approve_payment, reject_payment, set_free_forever)
--   that perform the privileged mutations these policies deliberately forbid
--   direct clients from making.
--
-- Design reference: design.md > "RLS Policy Summary".
-- Requirements: 7.6, 8.10, 9.6, 10.10, 12.2.
--
-- Target: PostgreSQL as provided by Supabase (uses auth.uid()).
--
-- Enablement + policies land together (0001 left RLS OFF on purpose) so no
-- table is ever left "RLS enabled but zero policies" (which is deny-all).

-- ===========================================================================
-- Admin check helper
-- ===========================================================================
-- We check admin membership through a SECURITY DEFINER function rather than a
-- direct subquery inside each policy. Reason (recursion safety): the `admins`
-- table itself has RLS enabled below with an admin-only policy. If that
-- policy were `exists (select 1 from admins ...)`, evaluating it would require
-- reading `admins`, which re-triggers the same policy => infinite recursion
-- ("infinite recursion detected in policy for relation admins").
--
-- A SECURITY DEFINER function runs as its owner and BYPASSES RLS on the tables
-- it reads, so `is_admin()` can read `admins` without invoking the admins
-- policy. It is marked STABLE (result constant within a statement) and has an
-- explicit, locked-down search_path to avoid search-path hijacking.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from admins where user_id = auth.uid()
  );
$$;

-- Allow authenticated/anon roles to call the helper from within policies.
grant execute on function is_admin() to anon, authenticated;

-- ===========================================================================
-- profiles
-- Read: own row; admins read all.            (Req 7.6)
-- Write: own row via INSERT/UPDATE, BUT is_free_forever & free_downloads_used
--        are immutable to non-admins (enforced by trigger below); admins may
--        write all.                           (Req 7.6, 8.10)
-- The protected columns are only ever mutated by the security-definer RPCs in
-- Task 6.3 (which run as owner and bypass RLS + the trigger's admin check).
-- ===========================================================================
alter table profiles enable row level security;

-- SELECT: a user sees only their own profile; admins see every profile.
create policy profiles_select_own_or_admin on profiles
  for select
  using (auth.uid() = id or is_admin());

-- INSERT: a user may create only their own profile row (id must be their uid).
-- Admins may insert any row. (Signup flow / Task 7 trigger also creates rows.)
create policy profiles_insert_own_or_admin on profiles
  for insert
  with check (auth.uid() = id or is_admin());

-- UPDATE: a user may update their own row; admins may update any row.
-- Column-level immutability for is_free_forever / free_downloads_used is
-- enforced by the trigger below (USING/WITH CHECK cannot express "these
-- specific columns may not change").
create policy profiles_update_own_or_admin on profiles
  for update
  using (auth.uid() = id or is_admin())
  with check (auth.uid() = id or is_admin());

-- Trigger enforcing column immutability on profiles.
-- Rejects any UPDATE that changes is_free_forever or free_downloads_used made
-- directly by an ordinary end user. Two sanctioned paths are allowed through:
--
--   1) Admins performing a direct write            => is_admin() is true.
--   2) The Task 6.3 SECURITY DEFINER RPCs
--      (consume_download / approve_payment /
--       set_free_forever), which are OWNED by an
--      elevated role (e.g. postgres) rather than
--      the PostgREST client roles.                  => current_user is not a
--                                                       client role.
--
-- Why the current_user check matters: `consume_download` increments
-- free_downloads_used for a REGULAR (non-admin) user, so an is_admin()-only
-- guard would wrongly block it. Inside a SECURITY DEFINER function, current_user
-- becomes the function owner (not 'authenticated'/'anon'), so we can distinguish
-- a sanctioned RPC write from a raw client write. End users reaching PostgREST
-- run as 'authenticated' (or 'anon') and cannot assume an elevated role, so they
-- cannot bypass this guard.
create or replace function enforce_profiles_immutable_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.is_free_forever is distinct from old.is_free_forever
      or new.free_downloads_used is distinct from old.free_downloads_used)
     and not is_admin()
     and current_user in ('authenticated', 'anon') then
    raise exception
      'free_downloads_used and is_free_forever cannot be modified directly (use an admin RPC)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_immutable_columns on profiles;
create trigger trg_profiles_immutable_columns
  before update on profiles
  for each row
  execute function enforce_profiles_immutable_columns();

-- ===========================================================================
-- products
-- Read: public (including anon) — pricing must be visible to build the paywall.
-- Write: admin only.                          (Req 10.10)
-- ===========================================================================
alter table products enable row level security;

create policy products_select_public on products
  for select
  using (true);

create policy products_write_admin on products
  for all
  using (is_admin())
  with check (is_admin());

-- ===========================================================================
-- payment_settings
-- Read: public (anon) — needed to build the upi://pay deep link.
-- Write: admin only.                          (Req 10.10)
-- ===========================================================================
alter table payment_settings enable row level security;

create policy payment_settings_select_public on payment_settings
  for select
  using (true);

create policy payment_settings_write_admin on payment_settings
  for all
  using (is_admin())
  with check (is_admin());

-- ===========================================================================
-- user_credits
-- Read: own rows; admins read all.            (Req 8.10)
-- Write: admin only — balances change exclusively via the approve RPC (6.3),
--        which runs SECURITY DEFINER. Clients can never self-grant credits.
-- ===========================================================================
alter table user_credits enable row level security;

create policy user_credits_select_own_or_admin on user_credits
  for select
  using (auth.uid() = user_id or is_admin());

create policy user_credits_write_admin on user_credits
  for all
  using (is_admin())
  with check (is_admin());

-- ===========================================================================
-- payment_requests
-- Read: own rows; admins read all.            (Req 9.6)
-- Insert: a user may create only their OWN request, and only in 'pending'
--         state — they cannot self-approve on insert.   (Req 9.6)
-- Update: admin only — users can NEVER change status (approve/reject happens
--         via admin RPCs in 6.3).             (Req 9.6, 10.10)
-- (No client DELETE policy: requests form an auditable history.)
-- ===========================================================================
alter table payment_requests enable row level security;

create policy payment_requests_select_own_or_admin on payment_requests
  for select
  using (auth.uid() = user_id or is_admin());

create policy payment_requests_insert_own_pending on payment_requests
  for insert
  with check (auth.uid() = user_id and status = 'pending');

create policy payment_requests_update_admin on payment_requests
  for update
  using (is_admin())
  with check (is_admin());

-- ===========================================================================
-- admins
-- Read: admin only; Write: admin only (seeded manually by the operator).
-- Uses is_admin() (SECURITY DEFINER) to avoid recursive policy evaluation on
-- this very table. (Req 10.10, 10.2)
-- ===========================================================================
alter table admins enable row level security;

create policy admins_all_admin on admins
  for all
  using (is_admin())
  with check (is_admin());

-- ===========================================================================
-- resumes (optional cross-device sync)
-- Read/Write: strictly the owning user's rows.   (Req 12.2)
-- ===========================================================================
alter table resumes enable row level security;

create policy resumes_select_own on resumes
  for select
  using (auth.uid() = user_id);

create policy resumes_insert_own on resumes
  for insert
  with check (auth.uid() = user_id);

create policy resumes_update_own on resumes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy resumes_delete_own on resumes
  for delete
  using (auth.uid() = user_id);
