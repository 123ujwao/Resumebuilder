-- ResumeForge — ALL MIGRATIONS COMBINED (run once in Supabase SQL Editor)
-- Paste this whole file into: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run on a fresh project. Order: schema -> RLS policies -> RPCs.
-- =====================================================================
-- ============================ 0001: SCHEMA ============================
-- =====================================================================

create table if not exists profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  display_name        text,
  created_at          timestamptz default now(),
  last_login_at       timestamptz,
  free_downloads_used int not null default 0,
  is_free_forever     boolean not null default false
);

create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  price         numeric not null,
  unlocks_count int not null default 1,
  active        boolean not null default true
);

create table if not exists user_credits (
  user_id           uuid references profiles(id) on delete cascade,
  product_id        uuid references products(id) on delete cascade,
  credits_remaining int not null default 0,
  primary key (user_id, product_id)
);

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

create table if not exists payment_settings (
  id     int primary key default 1,
  upi_id text not null,
  note   text
);

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists resumes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz default now()
);

-- =====================================================================
-- ========================= 0002: RLS POLICIES ========================
-- =====================================================================

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

grant execute on function is_admin() to anon, authenticated;

alter table profiles enable row level security;

create policy profiles_select_own_or_admin on profiles
  for select
  using (auth.uid() = id or is_admin());

create policy profiles_insert_own_or_admin on profiles
  for insert
  with check (auth.uid() = id or is_admin());

create policy profiles_update_own_or_admin on profiles
  for update
  using (auth.uid() = id or is_admin())
  with check (auth.uid() = id or is_admin());

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

alter table products enable row level security;

create policy products_select_public on products
  for select
  using (true);

create policy products_write_admin on products
  for all
  using (is_admin())
  with check (is_admin());

alter table payment_settings enable row level security;

create policy payment_settings_select_public on payment_settings
  for select
  using (true);

create policy payment_settings_write_admin on payment_settings
  for all
  using (is_admin())
  with check (is_admin());

alter table user_credits enable row level security;

create policy user_credits_select_own_or_admin on user_credits
  for select
  using (auth.uid() = user_id or is_admin());

create policy user_credits_write_admin on user_credits
  for all
  using (is_admin())
  with check (is_admin());

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

alter table admins enable row level security;

create policy admins_all_admin on admins
  for all
  using (is_admin())
  with check (is_admin());

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

-- =====================================================================
-- ============================ 0003: RPCs =============================
-- =====================================================================

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
  if v_uid is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  select is_free_forever, free_downloads_used
    into v_is_free_forever, v_free_used
    from profiles
   where id = v_uid
   for update;

  if not found then
    raise exception 'profile not found for current user'
      using errcode = 'no_data_found';
  end if;

  if v_is_free_forever then
    return 'free_forever';
  end if;

  if v_free_used < 2 then
    update profiles
       set free_downloads_used = free_downloads_used + 1
     where id = v_uid;
    return 'free';
  end if;

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

  return 'payment_required';
end;
$$;

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
  if not is_admin() then
    raise exception 'admin privileges required'
      using errcode = 'insufficient_privilege';
  end if;

  select status, user_id, product_id
    into v_status, v_user_id, v_product_id
    from payment_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'payment request % not found', p_request_id
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'pending' then
    raise exception 'payment request % is not pending (current status: %)',
      p_request_id, v_status
      using errcode = 'invalid_parameter_value';
  end if;

  select unlocks_count
    into v_unlocks_count
    from products
   where id = v_product_id;

  if not found then
    raise exception 'product % for request % not found', v_product_id, p_request_id
      using errcode = 'no_data_found';
  end if;

  update payment_requests
     set status = 'approved',
         approved_at = now()
   where id = p_request_id;

  insert into user_credits (user_id, product_id, credits_remaining)
  values (v_user_id, v_product_id, v_unlocks_count)
  on conflict (user_id, product_id)
  do update set credits_remaining = user_credits.credits_remaining + excluded.credits_remaining;

  return 'approved';
end;
$$;

create or replace function reject_payment(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if not is_admin() then
    raise exception 'admin privileges required'
      using errcode = 'insufficient_privilege';
  end if;

  select status
    into v_status
    from payment_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'payment request % not found', p_request_id
      using errcode = 'no_data_found';
  end if;

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

create or replace function set_free_forever(p_user_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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

revoke all on function consume_download(uuid)           from public;
revoke all on function approve_payment(uuid)            from public;
revoke all on function reject_payment(uuid)             from public;
revoke all on function set_free_forever(uuid, boolean)  from public;

revoke all on function consume_download(uuid)           from anon;
revoke all on function approve_payment(uuid)            from anon;
revoke all on function reject_payment(uuid)             from anon;
revoke all on function set_free_forever(uuid, boolean)  from anon;

grant execute on function consume_download(uuid)          to authenticated;
grant execute on function approve_payment(uuid)           to authenticated;
grant execute on function reject_payment(uuid)            to authenticated;
grant execute on function set_free_forever(uuid, boolean) to authenticated;

-- =====================================================================
-- Done. You should see "Success. No rows returned."
-- Next: sign up in the app, then seed admin/products (see supabase/seed.sql).
-- =====================================================================
