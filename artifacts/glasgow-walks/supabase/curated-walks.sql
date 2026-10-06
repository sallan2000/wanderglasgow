-- Incremental extension: existing attractions and administrator access are unchanged.
create or replace function public.glasgow_valid_walk_stops(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare s jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) > 30 then return false; end if;
  for s in select jsonb_array_elements(value) loop
    if jsonb_typeof(s) is distinct from 'object'
      or jsonb_typeof(s->'name') is distinct from 'string'
      or char_length(btrim(s->>'name')) not between 2 and 200
      or jsonb_typeof(s->'place') is distinct from 'string'
      or char_length(s->>'place') > 300
      or jsonb_typeof(s->'story') is distinct from 'string'
      or char_length(btrim(s->>'story')) not between 10 and 5000
      or jsonb_typeof(s->'lat') is distinct from 'number'
      or jsonb_typeof(s->'lon') is distinct from 'number' then return false; end if;
    if (s->>'lat')::double precision not between -90 and 90
      or (s->>'lon')::double precision not between -180 and 180 then return false; end if;
    -- Validate optional access field if present
    if s->'access' is not null and jsonb_typeof(s->'access') = 'object' then
      if jsonb_typeof((s->'access')->>'step_free') is not null and (s->'access'->>'step_free') not in ('unknown', 'yes', 'no')
        or jsonb_typeof((s->'access')->>'accessible_toilet') is not null and (s->'access'->>'accessible_toilet') not in ('unknown', 'yes', 'no')
        or jsonb_typeof((s->'access')->>'seating') is not null and (s->'access'->>'seating') not in ('unknown', 'yes', 'no')
        or ((s->'access')->>'notes') is not null and char_length((s->'access'->>'notes')) > 1500 then return false;
      end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.glasgow_valid_walk_stops(jsonb) from public;
grant execute on function public.glasgow_valid_walk_stops(jsonb) to anon, authenticated;

create table if not exists public.glasgow_curated_walks (
  id text primary key check (char_length(id) between 1 and 200),
  title text not null check (char_length(btrim(title)) between 3 and 200),
  subtitle text not null default '' check (char_length(subtitle) <= 1000),
  theme text not null,
  stops jsonb not null default '[]'::jsonb check (public.glasgow_valid_walk_stops(stops)),
  distance_km double precision not null default 0 check (distance_km between 0 and 100),
  minutes integer not null default 0 check (minutes between 0 and 10000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not published or (
    jsonb_array_length(stops) >= 2 and char_length(btrim(subtitle)) >= 10 and distance_km > 0 and minutes > 0
  ))
);
alter table public.glasgow_curated_walks drop constraint if exists glasgow_curated_walks_theme_fkey;
alter table public.glasgow_curated_walks add constraint glasgow_curated_walks_theme_fkey
  foreign key (theme) references public.glasgow_attraction_categories(name);
create unique index if not exists glasgow_curated_walks_title_unique
  on public.glasgow_curated_walks (lower(btrim(title)));
drop trigger if exists curated_walk_timestamps on public.glasgow_curated_walks;
create trigger curated_walk_timestamps before insert or update on public.glasgow_curated_walks
  for each row execute function glasgow_walks_private.attraction_timestamps();

alter table public.glasgow_curated_walks enable row level security;
revoke all on public.glasgow_curated_walks from public, anon, authenticated;
grant select on public.glasgow_curated_walks to anon, authenticated;
grant insert, update, delete on public.glasgow_curated_walks to authenticated;
drop policy if exists "Visitors read published walks" on public.glasgow_curated_walks;
create policy "Visitors read published walks" on public.glasgow_curated_walks
  for select to anon, authenticated using (published = true);
drop policy if exists "Authorised administrators manage walks" on public.glasgow_curated_walks;
create policy "Authorised administrators manage walks" on public.glasgow_curated_walks
  for all to authenticated using ((select public.is_attraction_admin()))
  with check ((select public.is_attraction_admin()));