-- ResumeForge — Security-Definer RPCs Migration
-- Task 6.3: Atomic, RLS-safe privileged mutation functions.
--
-- Scope of THIS migration: the four SECURITY DEFINER Postgres functions that
-- perform the privileged mutations RLS deliberately forbids clients from doing
-- directly (0002 locks down direct writes to profiles' protected columns,
-- user_credits, and payment_requests.status):
--
--   * consume_download(p_product_id)   — caller-scoped download gating.
--   * approve_payment(p_request_id)     — ADMIN: approve + grant credits once.
--   * reject_payment(p_request_id)      — ADMIN: reject a pending request.
--   * set_free_forever(p_user_id, ...)  — ADMIN: toggle free-forever override.
--
-- Design reference: design.md > "RLS Policy Summary" (security definer RPCs)
-- and "Download Gating" decision order.
-- Requirements: 8.10, 10.6, 10.7, 9.6 (plus gating order 8.2-8.6).
--
-- WHY SECURITY DEFINER: these functions run as the function OWNER (an elevated
-- role, e.g. postgres), so they bypass RLS on the tables they touch and they
-- satisfy the profiles column-immutability trigger from 0002 (whose sanctioned
-- path is "current_user is not 'authenticated'/'anon'"). Clients call them via
-- PostgREST but can only mutate through the narrow, audited paths coded here.
--
-- WHY set search_path = public, pg_temp: pins schema resolution so a caller
-- cannot hijack unqualified names via a malicious search_path (defense in depth
-- for SECURITY DEFINER functions).
--
-- Target: PostgreSQL as provided by Supabase (uses auth.uid()).

-- ===========================================================================
-- consume_download(p_product_id uuid) returns text
-- ---------------------------------------------------------------------------
-- Applies the download-gating decision order for the CURRENT authenticated
-- user against their OWN profile + user_credits. Returns a status string so
-- the client can react (allow the export, or show the paywall) instead of
-- catching an exception for the common "needs payment" case.
--
-- Decision order (Req 8.2-8.6):
--   a. is_free_forever              => 'free_forever' (change nothing).       (8.2)
--   b. free_downloads_used < 2      => increment, return 'free'.              (8.3, 8.4)
--      (the 2 free downloads are SHARED across all product types — the counter
--       lives on profiles, not per product.)
--   c. credits_remaining > 0        => decrement, return 'credit'.           (8.5)
--   d. otherwise                    => 'payment_required' (change nothing).  (8.6)
--
-- ATOMICITY / ANTI-DOUBLE-SPEND (Req 8.10): the caller's profile row is locked
-- FOR UPDATE up front, serializing concurrent download attempts by the same
-- user. This guarantees:
--   * free_downloads_used can NEVER exceed 2 — it is incremented ONLY on the
--     branch guarded by `< 2`, and the row lock prevents two concurrent calls
--     from both reading "1" and both incrementing.
--   * credits are decremented ONLY when > 0, so a balance can never go negative
--     (the credits row is also locked FOR UPDATE before the check+decrement).
--
-- SECURITY: user identity is taken from auth.uid() — a client-supplied user id
-- is never trusted. anon cannot call this (revoked below); a logged-in user is
-- required.
-- ===========================================================================
create or replace function consume_download(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid              uuid := auth.uid();
  v_is_free_forever  boolean;
  v_free_used        int;
  v_credits          int;
begin
  -- Must be an authenticated caller. auth.uid() is null for anon/no session.
  if v_uid is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  -- Lock the caller's profile row to serialize concurrent download attempts
  -- (prevents free-download double-spend / race conditions — Req 8.10).
  select is_free_forever, free_downloads_used
    into v_is_free_forever, v_free_used
    from profiles
   where id = v_uid
   for update;

  if not found then
    -- No profile row => not a provisioned user; treat as auth error.
    raise exception 'profile not found for current user'
      using errcode = 'no_data_found';
  end if;

  -- (a) Free-forever supremacy: allow, consume nothing. (Req 8.2)
  if v_is_free_forever then
    return 'free_forever';
  end if;

  -- (b) Free trial: shared across all product types. Increment ONLY while the
  --     count is strictly below 2 => the cap of 2 can never be exceeded.
  --     (Req 8.3, 8.4)
  if v_free_used < 2 then
    update profiles
       set free_downloads_used = free_downloads_used + 1
     where id = v_uid;
    return 'free';
  end if;

  -- (c) Paid credits for THIS product. Lock the credits row, then decrement
  --     ONLY when a positive balance exists => balance can never go negative.
  --     (Req 8.5)
  select credits_remaining
    into v_credits
    from user_credits
   where user_id = v_uid
     and product_id = p_product_id
   for update;

  if found and v_credits > 0 then
    update user_credits
       set credits_remaining = credits_remaining - 1
     where user_id = v_uid
       and product_id = p_product_id;
    return 'credit';
  end if;

  -- (d) Nothing available => require payment. Change nothing. (Req 8.6)
  return 'payment_required';
end;
$$;

-- ===========================================================================
-- approve_payment(p_request_id uuid) returns text — ADMIN ONLY
-- ---------------------------------------------------------------------------
-- Atomically approves a pending payment request and grants credits EXACTLY
-- ONCE.
--
-- STATUS MONOTONICITY (Req 10.6, Property 6): the transition is allowed ONLY
-- from 'pending'. The request row is locked FOR UPDATE and its status checked;
-- if it is not 'pending' (already approved/rejected), the function raises and
-- makes no changes. Because credits are granted in the SAME transaction as the
-- pending->approved flip, and that flip can happen only once, the product's
-- unlocks_count is credited exactly once per request — repeated calls cannot
-- double-grant, and an already-approved request can never be flipped.
--
-- SECURITY: guarded by is_admin(); non-admins get insufficient_privilege.
-- ===========================================================================
create or replace function approve_payment(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status        text;
  v_user_id       uuid;
  v_product_id    uuid;
  v_unlocks_count int;
begin
  -- Admin guard (Req 10.6 / 10.10).
  if not is_admin() then
    raise exception 'admin privileges required'
      using errcode = 'insufficient_privilege';
  end if;

  -- Lock the request row and read its current state.
  select status, user_id, product_id
    into v_status, v_user_id, v_product_id
    from payment_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'payment request % not found', p_request_id
      using errcode = 'no_data_found';
  end if;

  -- Monotonicity guard: only 'pending' may become 'approved'. Any other state
  -- (already approved/rejected) is rejected with no changes => credits granted
  -- exactly once. (Req 10.6)
  if v_status <> 'pending' then
    raise exception 'payment request % is not pending (current status: %)',
      p_request_id, v_status
      using errcode = 'invalid_parameter_value';
  end if;

  -- Resolve how many credits this product grants.
  select unlocks_count
    into v_unlocks_count
    from products
   where id = v_product_id;

  if not found then
    raise exception 'product % for request % not found', v_product_id, p_request_id
      using errcode = 'no_data_found';
  end if;

  -- Flip status pending -> approved and stamp approval time.
  update payment_requests
     set status = 'approved',
         approved_at = now()
   where id = p_request_id;

  -- Grant credits: upsert the per-(user, product) balance, incrementing by the
  -- product's unlocks_count. Guaranteed exactly once by the pending guard above.
  insert into user_credits (user_id, product_id, credits_remaining)
  values (v_user_id, v_product_id, v_unlocks_count)
  on conflict (user_id, product_id)
  do update set credits_remaining = user_credits.credits_remaining + excluded.credits_remaining;

  return 'approved';
end;
$$;

-- ===========================================================================
-- reject_payment(p_request_id uuid) returns text — ADMIN ONLY
-- ---------------------------------------------------------------------------
-- Sets a request's status to 'rejected' ONLY if it is currently 'pending'
-- (Req 10.7). Grants NO credits. Same monotonicity guarantee as approve: an
-- already-approved or already-rejected request cannot be changed.
--
-- SECURITY: guarded by is_admin().
-- ===========================================================================
create or replace function reject_payment(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  -- Admin guard (Req 10.7 / 10.10).
  if not is_admin() then
    raise exception 'admin privileges required'
      using errcode = 'insufficient_privilege';
  end if;

  -- Lock the request row and read its current state.
  select status
    into v_status
    from payment_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'payment request % not found', p_request_id
      using errcode = 'no_data_found';
  end if;

  -- Monotonicity guard: only 'pending' may become 'rejected'. (Req 10.7)
  if v_status <> 'pending' then
    raise exception 'payment request % is not pending (current status: %)',
      p_request_id, v_status
      using errcode = 'invalid_parameter_value';
  end if;

  update payment_requests
     set status = 'rejected'
   where id = p_request_id;

  return 'rejected';
end;
$$;

-- ===========================================================================
-- set_free_forever(p_user_id uuid, p_value boolean) returns void — ADMIN ONLY
-- ---------------------------------------------------------------------------
-- Sets profiles.is_free_forever for the target user. This is the sanctioned
-- path the profiles column-immutability trigger (0002) permits: as a SECURITY
-- DEFINER function it runs as the owner (current_user is not a client role),
-- so the trigger allows the protected-column write. (Req 9.6 / 8.2 override)
--
-- SECURITY: guarded by is_admin(). Note is_admin() itself keys off auth.uid(),
-- so even though the write runs as the owner, only a genuine admin caller can
-- reach the UPDATE.
-- ===========================================================================
create or replace function set_free_forever(p_user_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Admin guard.
  if not is_admin() then
    raise exception 'admin privileges required'
      using errcode = 'insufficient_privilege';
  end if;

  update profiles
     set is_free_forever = p_value
   where id = p_user_id;

  if not found then
    raise exception 'profile % not found', p_user_id
      using errcode = 'no_data_found';
  end if;
end;
$$;

-- ===========================================================================
-- Execute grants
-- ---------------------------------------------------------------------------
-- All four RPCs require a logged-in user, so execute is granted to
-- 'authenticated' only and explicitly REVOKED from anon/public. The admin-only
-- functions still grant to 'authenticated' but guard internally with
-- is_admin(), so a non-admin authenticated caller is rejected at runtime.
-- ===========================================================================

-- Lock down the default PUBLIC execute grant on these functions first.
revoke all on function consume_download(uuid)           from public;
revoke all on function approve_payment(uuid)            from public;
revoke all on function reject_payment(uuid)             from public;
revoke all on function set_free_forever(uuid, boolean)  from public;

-- anon (logged-out) callers may not invoke any of these.
revoke all on function consume_download(uuid)           from anon;
revoke all on function approve_payment(uuid)            from anon;
revoke all on function reject_payment(uuid)             from anon;
revoke all on function set_free_forever(uuid, boolean)  from anon;

-- Logged-in users may call them (admin-only ones self-guard via is_admin()).
grant execute on function consume_download(uuid)          to authenticated;
grant execute on function approve_payment(uuid)           to authenticated;
grant execute on function reject_payment(uuid)            to authenticated;
grant execute on function set_free_forever(uuid, boolean) to authenticated;
