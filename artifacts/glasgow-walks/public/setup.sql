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
