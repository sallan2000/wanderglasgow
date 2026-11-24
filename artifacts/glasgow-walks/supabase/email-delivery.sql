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

-- Separate global work budget before catalogue lookup. Denials do not increment.
create or replace function public.claim_walk_email_attempt()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  claim_time timestamptz;
  counter glasgow_walks_private.walk_email_limits%rowtype;
begin
  insert into glasgow_walks_private.walk_email_limits as existing (bucket, started_at, attempts)
    values ('lookup-attempts', clock_timestamp(), 0)
    on conflict (bucket) do update set attempts = existing.attempts
    returning * into counter;
  claim_time := clock_timestamp();
  if counter.started_at <= claim_time - interval '1 hour' then
    update glasgow_walks_private.walk_email_limits set started_at = claim_time, attempts = 1 where bucket = 'lookup-attempts';
  elsif counter.attempts >= 300 then
    return false;
  else
    update glasgow_walks_private.walk_email_limits set attempts = attempts + 1 where bucket = 'lookup-attempts';
  end if;
  return true;
end;
$$;
revoke all on function public.claim_walk_email_attempt() from public, anon, authenticated;
grant execute on function public.claim_walk_email_attempt() to service_role;

create or replace function public.claim_walk_email_send(recipient_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  claim_time timestamptz;
  counter glasgow_walks_private.walk_email_limits%rowtype;
  recipient_key text := 'recipient:' || recipient_hash;
  recipient_attempts integer;
begin
  if recipient_hash is null or recipient_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit key' using errcode = '22023';
  end if;
  -- Lock the global row first, serialising both quota decisions. Preserve the
  -- existing global and recipient counters when the upgrade is re-run.
  insert into glasgow_walks_private.walk_email_limits as existing (bucket, started_at, attempts)
    values ('global', clock_timestamp(), 0)
    on conflict (bucket) do update set attempts = existing.attempts
    returning * into counter;
  claim_time := clock_timestamp();
  delete from glasgow_walks_private.walk_email_limits
    where bucket like 'recipient:%' and started_at < claim_time - interval '2 hours';
  if counter.started_at <= claim_time - interval '1 hour' then
    update glasgow_walks_private.walk_email_limits set started_at = claim_time, attempts = 0 where bucket = 'global';
  elsif counter.attempts >= 100 then
    return false;
  end if;
  insert into glasgow_walks_private.walk_email_limits as existing (bucket, started_at, attempts)
    values (recipient_key, claim_time, 1)
    on conflict (bucket) do update set
      started_at = case when existing.started_at <= claim_time - interval '1 hour' then claim_time else existing.started_at end,
      attempts = case when existing.started_at <= claim_time - interval '1 hour' then 1 else existing.attempts + 1 end
    where existing.started_at <= claim_time - interval '1 hour' or existing.attempts < 3
    returning attempts into recipient_attempts;
  if recipient_attempts is null then return false; end if;
  update glasgow_walks_private.walk_email_limits set attempts = attempts + 1 where bucket = 'global';
  return true;
end;
$$;
revoke all on function public.claim_walk_email_send(text) from public, anon, authenticated;
grant execute on function public.claim_walk_email_send(text) to service_role;
commit;
notify pgrst, 'reload schema';