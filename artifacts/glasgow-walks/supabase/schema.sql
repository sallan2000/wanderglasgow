-- Wander Glasgow: run the generated public/setup.sql in your Supabase SQL Editor.
-- Uses a dedicated table/private schema; does not replace any existing database.
begin;

create schema if not exists glasgow_walks_private;
revoke all on schema glasgow_walks_private from public, anon, authenticated;

create table if not exists glasgow_walks_private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists glasgow_walks_private.seed_history (
  seed_key text primary key,
  applied_at timestamptz not null default now()
);
revoke all on all tables in schema glasgow_walks_private from public, anon, authenticated;

create or replace function public.is_attraction_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from glasgow_walks_private.admin_users where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_attraction_admin() from public;
grant execute on function public.is_attraction_admin() to anon, authenticated;

create table if not exists public.glasgow_attractions (
  id text primary key check (char_length(id) between 1 and 200),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  description text not null check (char_length(btrim(description)) between 10 and 5000),
  place text not null default '' check (char_length(place) <= 300),
  theme text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists glasgow_attractions_name_unique
  on public.glasgow_attractions (lower(btrim(name)));

create or replace function glasgow_walks_private.attraction_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if TG_OP = 'UPDATE' then new.created_at := old.created_at;
  else new.created_at := clock_timestamp(); end if;
  return new;
end;
$$;
revoke all on function glasgow_walks_private.attraction_timestamps() from public, anon, authenticated;
drop trigger if exists attraction_timestamps on public.glasgow_attractions;
create trigger attraction_timestamps before insert or update on public.glasgow_attractions
  for each row execute function glasgow_walks_private.attraction_timestamps();

alter table public.glasgow_attractions enable row level security;
revoke all on public.glasgow_attractions from public, anon, authenticated;
grant select on public.glasgow_attractions to anon, authenticated;
grant insert, update, delete on public.glasgow_attractions to authenticated;

drop policy if exists "Visitors read published attractions" on public.glasgow_attractions;
create policy "Visitors read published attractions" on public.glasgow_attractions
  for select to anon, authenticated using (published = true);
drop policy if exists "Authorised administrators manage attractions" on public.glasgow_attractions;
create policy "Authorised administrators manage attractions" on public.glasgow_attractions
  for all to authenticated using ((select public.is_attraction_admin()))
  with check ((select public.is_attraction_admin()));

-- The generated setup script appends the one-time catalogue seed and COMMIT.