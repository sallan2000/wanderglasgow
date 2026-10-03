-- FIRST create your account in Supabase Dashboard > Authentication > Users.
-- Replace the placeholder below with that account's email, then run in SQL Editor.
-- Never run this with the public API key. Only the project owner can grant access.
do $$
declare target_user uuid;
begin
  select id into target_user from auth.users
    where lower(email) = lower('REPLACE_WITH_ADMIN_EMAIL');
  if target_user is null then
    raise exception 'Create the administrator account in Supabase Authentication > Users, then replace REPLACE_WITH_ADMIN_EMAIL.';
  end if;
  insert into glasgow_walks_private.admin_users (user_id)
    values (target_user) on conflict (user_id) do nothing;
end;
$$;