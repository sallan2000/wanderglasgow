begin;
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
commit;
notify pgrst, 'reload schema';
