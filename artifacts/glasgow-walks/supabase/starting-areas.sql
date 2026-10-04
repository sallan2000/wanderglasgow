-- Additive extension to an installed Wander Glasgow Supabase project.
create table if not exists public.glasgow_starting_areas (
  id text primary key check (char_length(id) between 1 and 200 and id <> 'gps'),
  name text not null check (
    name = btrim(name) and char_length(name) between 2 and 80
    and lower(name) <> 'my location'
  ),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists glasgow_starting_areas_name_unique
  on public.glasgow_starting_areas (lower(name));
drop trigger if exists starting_area_timestamps on public.glasgow_starting_areas;
create trigger starting_area_timestamps before insert or update on public.glasgow_starting_areas
  for each row execute function glasgow_walks_private.attraction_timestamps();

alter table public.glasgow_starting_areas enable row level security;
revoke all on public.glasgow_starting_areas from public, anon, authenticated;
grant select on public.glasgow_starting_areas to anon, authenticated;
grant insert, update, delete on public.glasgow_starting_areas to authenticated;
drop policy if exists "Visitors read starting areas" on public.glasgow_starting_areas;
create policy "Visitors read starting areas" on public.glasgow_starting_areas
  for select to anon, authenticated using (true);
drop policy if exists "Authorised administrators manage starting areas" on public.glasgow_starting_areas;
create policy "Authorised administrators manage starting areas" on public.glasgow_starting_areas
  for all to authenticated using ((select public.is_attraction_admin()))
  with check ((select public.is_attraction_admin()));

-- A private seed marker preserves both edits and deletions across repeated upgrades.
do $area_seed$
begin
  if not exists (select 1 from glasgow_walks_private.seed_history where seed_key = 'initial-starting-areas') then
    insert into public.glasgow_starting_areas (id, name, latitude, longitude) values
      ('centre', 'City centre', 55.8609, -4.2514),
      ('west', 'West End', 55.8745, -4.2916),
      ('east', 'East End', 55.8545, -4.2372)
      on conflict do nothing;
    insert into glasgow_walks_private.seed_history (seed_key) values ('initial-starting-areas');
  end if;
end;
$area_seed$;