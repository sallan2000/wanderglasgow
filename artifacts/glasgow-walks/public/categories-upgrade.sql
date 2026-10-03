begin;
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
commit;
notify pgrst, 'reload schema';
