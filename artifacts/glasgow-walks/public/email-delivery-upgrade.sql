-- Owner-run extension for the public walk-email function.
-- Stores counters only, never raw email addresses, locations or walk contents.
begin;
create schema if not exists glasgow_walks_private;
revoke all on schema glasgow_walks_private from public, anon, authenticated;
create table if not exists glasgow_walks_private.walk_email_limits (
  bucket text primary key,
  started_at timestamptz not null,
  attempts integer not null check (attempts >= 0)
);
revoke all on glasgow_walks_private.walk_email_limits from public, anon, authenticated;
alter table glasgow_walks_private.walk_email_limits enable row level security;

create or replace function public.claim_walk_email_send(recipient_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  claim_time timestamptz := clock_timestamp();
  bucket_key text;
  bucket_limit integer;
  attempts_now integer;
begin
  if recipient_hash is null or recipient_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit key' using errcode = '22023';
  end if;
  delete from glasgow_walks_private.walk_email_limits where started_at < claim_time - interval '2 hours';
  -- Global first serialises claims across function instances; both counters are
  -- incremented for attempts, including provider failures. Never reset on setup re-runs.
  foreach bucket_key in array array['global', 'recipient:' || recipient_hash] loop
    bucket_limit := case when bucket_key = 'global' then 100 else 3 end;
    insert into glasgow_walks_private.walk_email_limits as existing (bucket, started_at, attempts)
      values (bucket_key, claim_time, 1)
      on conflict (bucket) do update set
        started_at = case when existing.started_at <= claim_time - interval '1 hour' then claim_time else existing.started_at end,
        attempts = case when existing.started_at <= claim_time - interval '1 hour' then 1 else existing.attempts + 1 end
      returning attempts into attempts_now;
    if attempts_now > bucket_limit then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.claim_walk_email_send(text) from public, anon, authenticated;
grant execute on function public.claim_walk_email_send(text) to service_role;
commit;
notify pgrst, 'reload schema';