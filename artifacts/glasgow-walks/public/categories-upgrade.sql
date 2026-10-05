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
commit;
notify pgrst, 'reload schema';
