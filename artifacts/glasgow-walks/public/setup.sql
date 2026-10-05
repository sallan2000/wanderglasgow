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
-- Owner-run extension. Requires the original attraction schema.
-- Only adds fields/checks; does not change rows, grants, policies or authorisation.
alter table public.glasgow_attractions
  add column if not exists step_free_access text not null default 'unknown',
  add column if not exists accessible_toilet text not null default 'unknown',
  add column if not exists seating text not null default 'unknown',
  add column if not exists access_notes text not null default '';

do $access_constraints$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.glasgow_attractions'::regclass and conname = 'glasgow_attractions_access_check') then
    alter table public.glasgow_attractions add constraint glasgow_attractions_access_check check (
      step_free_access in ('unknown', 'yes', 'no')
      and accessible_toilet in ('unknown', 'yes', 'no')
      and seating in ('unknown', 'yes', 'no')
      and char_length(btrim(access_notes)) <= 1500
    );
  end if;
end;
$access_constraints$;
-- Custom attraction categories. Re-running this preserves attractions and admin access.
-- Included in fresh setup.sql and in the standalone categories-upgrade.sql.
create table if not exists public.glasgow_attraction_categories (
  name text primary key check (
    name = btrim(name) and char_length(name) between 2 and 40
    and lower(name) <> 'all'
  ),
  created_at timestamptz not null default now()
);
create unique index if not exists glasgow_attraction_categories_name_unique
  on public.glasgow_attraction_categories (lower(name));

insert into public.glasgow_attraction_categories (name)
  values ('Art'), ('Music'), ('History'), ('Sport')
  on conflict do nothing;

alter table public.glasgow_attraction_categories enable row level security;
revoke all on public.glasgow_attraction_categories from public, anon, authenticated;
grant select on public.glasgow_attraction_categories to anon, authenticated;
grant insert on public.glasgow_attraction_categories to authenticated;

drop policy if exists "Visitors read attraction categories" on public.glasgow_attraction_categories;
create policy "Visitors read attraction categories" on public.glasgow_attraction_categories
  for select to anon, authenticated using (true);
drop policy if exists "Authorised administrators add categories" on public.glasgow_attraction_categories;
create policy "Authorised administrators add categories" on public.glasgow_attraction_categories
  for insert to authenticated with check ((select public.is_attraction_admin()));

-- Upgrade the original four-value check to a reference to the shared category list.
alter table public.glasgow_attractions drop constraint if exists glasgow_attractions_theme_check;
alter table public.glasgow_attractions drop constraint if exists glasgow_attractions_theme_fkey;
alter table public.glasgow_attractions add constraint glasgow_attractions_theme_fkey
  foreign key (theme) references public.glasgow_attraction_categories(name)
  on update cascade on delete restrict;

-- Category management is one atomic, administrator-only operation. Keep the
-- curated-walk query dynamic so this upgrade also works before walks are set up.
create or replace function public.list_attraction_category_usage()
returns table(category_name text, attraction_count bigint, curated_walk_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_name text;
  v_attractions bigint;
  v_walks bigint;
begin
  if not coalesce(public.is_attraction_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  for v_name in
    select c.name from public.glasgow_attraction_categories as c order by c.name
  loop
    select count(*) into v_attractions
      from public.glasgow_attractions as a where a.theme = v_name;
    v_walks := 0;
    if pg_catalog.to_regclass('public.glasgow_curated_walks') is not null then
      execute 'select count(*) from public.glasgow_curated_walks where theme = $1'
        into v_walks using v_name;
    end if;
    return query select v_name, v_attractions, v_walks;
  end loop;
end;
$$;
revoke all on function public.list_attraction_category_usage() from public, anon;
grant execute on function public.list_attraction_category_usage() to authenticated;

create or replace function public.remove_attraction_category(
  p_category_name text,
  p_replacement_name text,
  p_expected_attractions bigint,
  p_expected_curated_walks bigint
)
returns table(attractions_moved bigint, curated_walks_moved bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_attractions bigint;
  v_walks bigint := 0;
  v_locked bigint;
  v_changed bigint;
begin
  if not coalesce(public.is_attraction_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_category_name is null or p_replacement_name is null
    or pg_catalog.btrim(p_category_name) = ''
    or pg_catalog.btrim(p_replacement_name) = ''
    or pg_catalog.lower(p_category_name) = pg_catalog.lower(p_replacement_name)
    or p_expected_attractions is null or p_expected_attractions < 0
    or p_expected_curated_walks is null or p_expected_curated_walks < 0 then
    raise exception using errcode = '22023', message = 'Choose an existing category and a different replacement.';
  end if;

  -- Use a consistent lock order so concurrent removals cannot leave either
  -- source partially reassigned. Foreign keys block new references meanwhile.
  perform c.name
    from public.glasgow_attraction_categories as c
    where c.name in (p_category_name, p_replacement_name)
    order by c.name for update;
  get diagnostics v_locked = row_count;
  if v_locked <> 2 then
    raise exception using errcode = 'P0002', message = 'A selected category no longer exists. Refresh and try again.';
  end if;

  select count(*) into v_attractions
    from public.glasgow_attractions as a where a.theme = p_category_name;
  if pg_catalog.to_regclass('public.glasgow_curated_walks') is not null then
    execute 'select count(*) from public.glasgow_curated_walks where theme = $1'
      into v_walks using p_category_name;
  end if;
  if v_attractions <> p_expected_attractions or v_walks <> p_expected_curated_walks then
    raise exception using errcode = '40001',
      message = 'Category usage changed while you were reviewing it. Refresh the counts and confirm again.';
  end if;

  update public.glasgow_attractions set theme = p_replacement_name where theme = p_category_name;
  get diagnostics v_changed = row_count;
  if v_changed <> v_attractions then
    raise exception using errcode = '40001', message = 'Attractions changed during category removal. Refresh and try again.';
  end if;

  if pg_catalog.to_regclass('public.glasgow_curated_walks') is not null then
    execute 'update public.glasgow_curated_walks set theme = $1 where theme = $2'
      using p_replacement_name, p_category_name;
    get diagnostics v_changed = row_count;
    if v_changed <> v_walks then
      raise exception using errcode = '40001', message = 'Curated walks changed during category removal. Refresh and try again.';
    end if;
  end if;

  delete from public.glasgow_attraction_categories as c where c.name = p_category_name;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception using errcode = '40001', message = 'The category changed during removal. Refresh and try again.';
  end if;

  return query select v_attractions, v_walks;
end;
$$;
revoke all on function public.remove_attraction_category(text, text, bigint, bigint) from public, anon;
grant execute on function public.remove_attraction_category(text, text, bigint, bigint) to authenticated;
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
do $walk_seed$
begin
  if not exists (select 1 from glasgow_walks_private.seed_history where seed_key = 'initial-curated-walks') then
    insert into public.glasgow_curated_walks (id, title, subtitle, theme, stops, distance_km, minutes, published)
    values
('art-mile', 'The Art School to the river', 'Mackintosh lines, civic grandeur and the city’s most loved collection.', 'Art', '[{"name":"Glasgow School of Art","place":"Renfrew Street","lat":55.8653,"lon":-4.2631,"story":"The Mackintosh building is a landmark of modern design, badly damaged by fire in 2018. This stop is an exterior viewpoint; do not expect access to the building."},{"name":"The Lighthouse","place":"Mitchell Lane","lat":55.8596561,"lon":-4.255458,"story":"A former newspaper building designed by Mackintosh, later used as a centre for architecture and design. Admire the exterior; check official access information before planning an indoor visit."},{"name":"Gallery of Modern Art","place":"Royal Exchange Square","lat":55.8601675,"lon":-4.2526408,"story":"GoMA occupies a handsome neoclassical mansion in the middle of the city. Its changing exhibitions put international contemporary art in a very Glasgow setting."},{"name":"Barras Art and Design","place":"Gallowgate","lat":55.8545597,"lon":-4.2372088,"story":"A lively East End market area with a long tradition of independent makers, vintage finds and street-level creativity."}]'::jsonb, 2.9, 39, true),
('kelvingrove-culture', 'West End wonders', 'An art collection, university cloisters and West End lanes.', 'Art', '[{"name":"Kelvingrove Art Gallery and Museum","place":"Argyle Street","lat":55.8686,"lon":-4.2905,"story":"A Glasgow favourite since 1901, with everything from Salvador Dalí to natural history beneath its ornate red sandstone roof."},{"name":"University of Glasgow Cloisters","place":"University Avenue","lat":55.8716587,"lon":-4.2883961,"story":"The vaulted arches beneath the Gilbert Scott building are among the city’s most memorable spaces. Look up: every stone seems to have a story."},{"name":"Ashton Lane","place":"Hillhead","lat":55.8736982,"lon":-4.2931079,"story":"A cobbled lane tucked behind Byres Road, known for its little lights, old tenements and lively independent bars."}]'::jsonb, 1.4, 19, true),
('sound-of-the-city', 'The sound of the city', 'From the Barrowlands glow to the venues that made a scene.', 'Music', '[{"name":"Barrowland Ballroom","place":"Gallowgate","lat":55.855084,"lon":-4.2367353,"story":"The neon arch has welcomed generations of gig-goers. Opened in 1934, the Barrowland remains one of the UK’s most treasured live music rooms."},{"name":"St Luke’s","place":"Gallowgate","lat":55.8546665,"lon":-4.2345948,"story":"A beautifully restored former church turned music and arts venue, right in the heart of the East End."},{"name":"The Britannia Panopticon","place":"Trongate","lat":55.8569611,"lon":-4.2470152,"story":"The world’s oldest surviving music hall. Stan Laurel made his stage debut here in 1906."},{"name":"King Tut’s Wah Wah Hut","place":"St Vincent Street","lat":55.862618,"lon":-4.2649646,"story":"A tiny room with a huge reputation: Oasis were famously signed after playing here in 1993."}]'::jsonb, 2.7, 37, true),
('west-end-sessions', 'West End after hours', 'A mellow ramble through record shops, old halls and gig-night streets.', 'Music', '[{"name":"Òran Mór","place":"Byres Road","lat":55.8775552,"lon":-4.2897025,"story":"A former church with a painted ceiling and a second life as a celebrated venue for music, theatre and the short lunchtime play."},{"name":"The Doublet","place":"Park Road","lat":55.8730818,"lon":-4.2793522,"story":"A snug neighbourhood institution: a good place to pause and imagine the West End between gigs."},{"name":"The Hug and Pint","place":"Great Western Road","lat":55.8722036,"lon":-4.2723707,"story":"An intimate independent venue where Glasgow’s adventurous live music scene keeps finding new voices."}]'::jsonb, 1.5, 21, true),
('medieval-glasgow', 'Old Glasgow, layer by layer', 'Follow the oldest streets from the cathedral down to the river.', 'History', '[{"name":"Glasgow Cathedral","place":"Castle Street","lat":55.8629,"lon":-4.2344,"story":"The city’s medieval heart, and one of Scotland’s finest surviving Gothic buildings. St Mungo’s tomb lies in the lower church."},{"name":"The Necropolis","place":"Castle Street","lat":55.8622,"lon":-4.2298,"story":"A Victorian garden cemetery on a hill above the cathedral, with elaborate monuments and a remarkable panorama."},{"name":"Provand’s Lordship","place":"Castle Street","lat":55.8623705,"lon":-4.2369257,"story":"Built around 1471, this is Glasgow’s oldest surviving house. The adjoining St Nicholas Garden is a peaceful pocket of medieval-inspired planting."},{"name":"Trongate","place":"City Centre","lat":55.8557,"lon":-4.248,"story":"One of Glasgow’s oldest streets, once the way in from the east and still lined with layers of civic and mercantile history."}]'::jsonb, 2.8, 38, true),
('merchant-city', 'Merchants, makers & monuments', 'A city-centre walk through Glasgow’s mercantile past.', 'History', '[{"name":"George Square","place":"City Chambers","lat":55.861,"lon":-4.2505,"story":"Surrounded by Victorian architecture and monuments, the square has been Glasgow’s civic gathering place since the 18th century."},{"name":"City Chambers","place":"George Square","lat":55.8608,"lon":-4.2498,"story":"The grand marble staircase and Italianate façade tell the story of the wealth and confidence of Victorian Glasgow."},{"name":"Merchant City","place":"Trongate","lat":55.8552,"lon":-4.247,"story":"Warehouses built for tobacco and textile merchants have become a district of independent shops, studios and restaurants."},{"name":"Clyde Street","place":"River Clyde","lat":55.8565,"lon":-4.2513,"story":"Look south to the Clyde, once the engine room of shipbuilding and trade that gave Glasgow its global reach."}]'::jsonb, 1.3, 18, true),
('football-glasgow', 'Football’s East End', 'Stadium architecture, local pride and the city’s match-day rituals.', 'Sport', '[{"name":"Celtic Park","place":"Kerrydale Street","lat":55.8501815,"lon":-4.2068227,"story":"One of Europe’s largest club grounds. Celtic was founded in 1888 with charitable aims; the club moved to this stadium site in 1892."},{"name":"Barrowfield","place":"East End","lat":55.851342,"lon":-4.2125805,"story":"An East End neighbourhood with deep links to Glasgow football and the club’s historic training ground. This is a street-level stop, not a training-ground visit."},{"name":"Emirates Arena","place":"London Road","lat":55.8464908,"lon":-4.2085735,"story":"A striking indoor arena and velodrome, built for the 2014 Commonwealth Games and home to Scotland’s national cycling centre."}]'::jsonb, 1.7, 24, true),
('commonwealth-mile', 'Commonwealth stories', 'The lasting legacy of Glasgow 2014, found on foot.', 'Sport', '[{"name":"Glasgow Green","place":"Saltmarket","lat":55.8497,"lon":-4.233,"story":"The city’s oldest public park is beside the Glasgow National Hockey Centre, which hosted hockey during the 2014 Commonwealth Games."},{"name":"Sir Chris Hoy Velodrome","place":"London Road","lat":55.8473824,"lon":-4.207985,"story":"Named for the six-time Olympic cycling champion, the velodrome helped put Glasgow on the international sporting map."},{"name":"Celtic Park","place":"Kerrydale Street","lat":55.8501815,"lon":-4.2068227,"story":"Celtic Park hosted the opening ceremony of the 2014 Commonwealth Games. Admire the stadium exterior and check access arrangements before visiting."}]'::jsonb, 2.4, 32, true)
    on conflict do nothing;
    insert into glasgow_walks_private.seed_history (seed_key) values ('initial-curated-walks');
  end if;
end;
$walk_seed$;

do $seed$
begin
  if not exists (select 1 from glasgow_walks_private.seed_history where seed_key = 'initial-catalogue') then
    insert into public.glasgow_attractions (id, name, description, place, theme, latitude, longitude, published)
    values
('glasgow-school-of-art', 'Glasgow School of Art', 'The Mackintosh building is a landmark of modern design, badly damaged by fire in 2018. This stop is an exterior viewpoint; do not expect access to the building.', 'Renfrew Street', 'Art', 55.8653, -4.2631, true),
('lighthouse', 'The Lighthouse', 'A former newspaper building designed by Mackintosh, later used as a centre for architecture and design. Admire the exterior; check official access information before planning an indoor visit.', 'Mitchell Lane', 'Art', 55.8596561, -4.255458, true),
('gallery-of-modern-art', 'Gallery of Modern Art', 'GoMA occupies a handsome neoclassical mansion in the middle of the city. Its changing exhibitions put international contemporary art in a very Glasgow setting.', 'Royal Exchange Square', 'Art', 55.8601675, -4.2526408, true),
('barras-art-and-design', 'Barras Art and Design', 'A lively East End market area with a long tradition of independent makers, vintage finds and street-level creativity.', 'Gallowgate', 'Art', 55.8545597, -4.2372088, true),
('kelvingrove-art-gallery-and-museum', 'Kelvingrove Art Gallery and Museum', 'A Glasgow favourite since 1901, with everything from Salvador Dalí to natural history beneath its ornate red sandstone roof.', 'Argyle Street', 'Art', 55.8686, -4.2905, true),
('university-of-glasgow-cloisters', 'University of Glasgow Cloisters', 'The vaulted arches beneath the Gilbert Scott building are among the city’s most memorable spaces. Look up: every stone seems to have a story.', 'University Avenue', 'Art', 55.8716587, -4.2883961, true),
('ashton-lane', 'Ashton Lane', 'A cobbled lane tucked behind Byres Road, known for its little lights, old tenements and lively independent bars.', 'Hillhead', 'Art', 55.8736982, -4.2931079, true),
('barrowland-ballroom', 'Barrowland Ballroom', 'The neon arch has welcomed generations of gig-goers. Opened in 1934, the Barrowland remains one of the UK’s most treasured live music rooms.', 'Gallowgate', 'Music', 55.855084, -4.2367353, true),
('st-luke-s', 'St Luke’s', 'A beautifully restored former church turned music and arts venue, right in the heart of the East End.', 'Gallowgate', 'Music', 55.8546665, -4.2345948, true),
('britannia-panopticon', 'The Britannia Panopticon', 'The world’s oldest surviving music hall. Stan Laurel made his stage debut here in 1906.', 'Trongate', 'Music', 55.8569611, -4.2470152, true),
('king-tut-s-wah-wah-hut', 'King Tut’s Wah Wah Hut', 'A tiny room with a huge reputation: Oasis were famously signed after playing here in 1993.', 'St Vincent Street', 'Music', 55.862618, -4.2649646, true),
('oran-mor', 'Òran Mór', 'A former church with a painted ceiling and a second life as a celebrated venue for music, theatre and the short lunchtime play.', 'Byres Road', 'Music', 55.8775552, -4.2897025, true),
('doublet', 'The Doublet', 'A snug neighbourhood institution: a good place to pause and imagine the West End between gigs.', 'Park Road', 'Music', 55.8730818, -4.2793522, true),
('hug-and-pint', 'The Hug and Pint', 'An intimate independent venue where Glasgow’s adventurous live music scene keeps finding new voices.', 'Great Western Road', 'Music', 55.8722036, -4.2723707, true),
('glasgow-cathedral', 'Glasgow Cathedral', 'The city’s medieval heart, and one of Scotland’s finest surviving Gothic buildings. St Mungo’s tomb lies in the lower church.', 'Castle Street', 'History', 55.8629, -4.2344, true),
('necropolis', 'The Necropolis', 'A Victorian garden cemetery on a hill above the cathedral, with elaborate monuments and a remarkable panorama.', 'Castle Street', 'History', 55.8622, -4.2298, true),
('provand-s-lordship', 'Provand’s Lordship', 'Built around 1471, this is Glasgow’s oldest surviving house. The adjoining St Nicholas Garden is a peaceful pocket of medieval-inspired planting.', 'Castle Street', 'History', 55.8623705, -4.2369257, true),
('trongate', 'Trongate', 'One of Glasgow’s oldest streets, once the way in from the east and still lined with layers of civic and mercantile history.', 'City Centre', 'History', 55.8557, -4.248, true),
('george-square', 'George Square', 'Surrounded by Victorian architecture and monuments, the square has been Glasgow’s civic gathering place since the 18th century.', 'City Chambers', 'History', 55.861, -4.2505, true),
('city-chambers', 'City Chambers', 'The grand marble staircase and Italianate façade tell the story of the wealth and confidence of Victorian Glasgow.', 'George Square', 'History', 55.8608, -4.2498, true),
('merchant-city', 'Merchant City', 'Warehouses built for tobacco and textile merchants have become a district of independent shops, studios and restaurants.', 'Trongate', 'History', 55.8552, -4.247, true),
('clyde-street', 'Clyde Street', 'Look south to the Clyde, once the engine room of shipbuilding and trade that gave Glasgow its global reach.', 'River Clyde', 'History', 55.8565, -4.2513, true),
('celtic-park', 'Celtic Park', 'Celtic Park hosted the opening ceremony of the 2014 Commonwealth Games. Admire the stadium exterior and check access arrangements before visiting.', 'Kerrydale Street', 'Sport', 55.8501815, -4.2068227, true),
('barrowfield', 'Barrowfield', 'An East End neighbourhood with deep links to Glasgow football and the club’s historic training ground. This is a street-level stop, not a training-ground visit.', 'East End', 'Sport', 55.851342, -4.2125805, true),
('emirates-arena', 'Emirates Arena', 'A striking indoor arena and velodrome, built for the 2014 Commonwealth Games and home to Scotland’s national cycling centre.', 'London Road', 'Sport', 55.8464908, -4.2085735, true),
('glasgow-green', 'Glasgow Green', 'The city’s oldest public park is beside the Glasgow National Hockey Centre, which hosted hockey during the 2014 Commonwealth Games.', 'Saltmarket', 'Sport', 55.8497, -4.233, true),
('sir-chris-hoy-velodrome', 'Sir Chris Hoy Velodrome', 'Named for the six-time Olympic cycling champion, the velodrome helped put Glasgow on the international sporting map.', 'London Road', 'Sport', 55.8473824, -4.207985, true)
    on conflict do nothing;
    insert into glasgow_walks_private.seed_history (seed_key) values ('initial-catalogue');
  end if;
end;
$seed$;
commit;
notify pgrst, 'reload schema';
