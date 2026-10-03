import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Exercise actual PostgreSQL policies in an isolated in-memory database.
// Does not connect to Replit databases or mutate the owner's Supabase project.
const db = new PGlite();
const admin = '11111111-1111-4111-8111-111111111111';
const ordinary = '22222222-2222-4222-8222-222222222222';
let checks = 0;
const check = (condition, message) => { assert(condition, message); checks++; };
const denied = async (sql, code = '42501') => {
  await assert.rejects(db.query(sql), error => error.code === code);
  checks++;
};
const as = async (role, id = '') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec(`set role ${role}`);
};
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
try {
  await db.exec(`
    create role anon noinherit;
    create role authenticated noinherit;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values
      ('${admin}', 'owner@example.invalid'), ('${ordinary}', 'visitor@example.invalid');
  `);
  const setup = await readFile('public/setup.sql', 'utf8');
  await db.exec(setup);
  await db.exec((await readFile('supabase/grant-admin.sql', 'utf8')).replace('REPLACE_WITH_ADMIN_EMAIL', 'owner@example.invalid'));
  // Simulate the already-installed, four-category schema and exercise its real upgrade.
  await db.exec(`
    alter table public.glasgow_attractions drop constraint glasgow_attractions_theme_fkey;
    drop table public.glasgow_attraction_categories;
    alter table public.glasgow_attractions add constraint glasgow_attractions_theme_check
      check (theme in ('Art','Music','History','Sport'));
  `);
  const beforeUpgrade = await rows('select * from public.glasgow_attractions order by id');
  const upgrade = await readFile('public/categories-upgrade.sql', 'utf8');
  await db.exec(upgrade);
  assert.deepEqual(await rows('select * from public.glasgow_attractions order by id'), beforeUpgrade);
  checks++;
  await db.exec(upgrade);
  check((await rows('select * from public.glasgow_attraction_categories')).length === 4, 'Category upgrade can be safely re-run');
  await as('anon');
  check((await rows('select * from public.glasgow_attractions')).length === 27, 'Anonymous visitors read the seeded catalogue');
  check((await rows('select public.is_attraction_admin() as allowed'))[0].allowed === false, 'Anonymous identity is not admin');
  await denied("select * from glasgow_walks_private.admin_users");
  const insert = "insert into public.glasgow_attractions (id,name,description,theme,latitude,longitude,published) values ('test-admin-stop','Test stop','A description of this test attraction.','Art',55.86,-4.25,false)";
  await denied(insert);
  await denied("update public.glasgow_attractions set name = 'Forged visitor name'");
  await denied("delete from public.glasgow_attractions");
  check((await rows('select name from public.glasgow_attraction_categories')).length === 4, 'Visitors can read category choices');
  await denied("insert into public.glasgow_attraction_categories (name) values ('Forged category')");

  await as('authenticated', ordinary);
  check((await rows('select public.is_attraction_admin() as allowed'))[0].allowed === false, 'Ordinary signed-in account is not admin');
  await denied(insert);
  await denied("insert into public.glasgow_attraction_categories (name) values ('Forged category')");
  await denied(`insert into glasgow_walks_private.admin_users values ('${ordinary}')`);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({user_metadata:{admin:true,role:'admin'}})]);
  check((await rows('select public.is_attraction_admin() as allowed'))[0].allowed === false, 'Self-supplied metadata cannot grant admin rights');
  check((await rows("update public.glasgow_attractions set name = 'Unauthorised edit' returning id")).length === 0, 'Non-admin update matches no editable rows');
  check((await rows('delete from public.glasgow_attractions returning id')).length === 0, 'Non-admin delete matches no editable rows');

  await as('authenticated', admin);
  check((await rows('select public.is_attraction_admin() as allowed'))[0].allowed === true, 'Explicitly granted admin recognised');
  await db.exec("insert into public.glasgow_attraction_categories (name) values ('Food & drink')");
  check((await rows("select name from public.glasgow_attraction_categories where name='Food & drink'")).length === 1, 'Admin category creation persists');
  await denied("insert into public.glasgow_attraction_categories (name) values ('food & drink')", '23505');
  await denied("insert into public.glasgow_attraction_categories (name) values ('All')", '23514');
  await denied("insert into public.glasgow_attraction_categories (name) values ('  Parks  ')", '23514');
  await denied("insert into public.glasgow_attraction_categories (name) values ('')", '23514');
  await denied("insert into public.glasgow_attraction_categories (name) values (repeat('x',41))", '23514');
  await db.exec("insert into public.glasgow_attractions (id,name,description,theme,latitude,longitude,published) values ('custom-category-stop','Admin cafe','A real description for this cafe.','Food & drink',55.8609,-4.2514,true)");
  await denied("update public.glasgow_attractions set theme='Unknown category' where id='custom-category-stop'", '23503');
  await as('anon');
  check((await rows("select name from public.glasgow_attraction_categories where name='Food & drink'")).length === 1, 'Custom categories visible to a separate public session');
  check((await rows("select theme from public.glasgow_attractions where id='custom-category-stop'"))[0].theme === 'Food & drink', 'Published attractions retain their new category for visitors');
  await as('authenticated', admin);
  await db.exec(insert);
  const initial = (await rows("select * from public.glasgow_attractions where id = 'test-admin-stop'"))[0];
  check(initial.published === false, 'Admin can create a draft with exact coordinates');
  await as('anon');
  check((await rows("select * from public.glasgow_attractions where id = 'test-admin-stop'")).length === 0, 'Draft invisible to anonymous visitors');
  await as('authenticated', ordinary);
  check((await rows("select * from public.glasgow_attractions where id = 'test-admin-stop'")).length === 0, 'Draft invisible to signed-in non-admin');

  await as('authenticated', admin);
  await denied("update public.glasgow_attractions set theme='Art,Music' where id='test-admin-stop'", '23503');
  await denied("update public.glasgow_attractions set latitude=91 where id='test-admin-stop'", '23514');
  await denied("update public.glasgow_attractions set longitude=-181 where id='test-admin-stop'", '23514');
  await denied("update public.glasgow_attractions set latitude='NaN' where id='test-admin-stop'", '23514');
  await denied("update public.glasgow_attractions set description='short' where id='test-admin-stop'", '23514');
  await denied("update public.glasgow_attractions set name='' where id='test-admin-stop'", '23514');
  await denied(insert.replace("'test-admin-stop'", "'another-id'").replace("'Test stop'", "' TEST STOP '"), '23505');
  const changed = await rows("update public.glasgow_attractions set published=true, latitude=55.861234, longitude=-4.251234 where id='test-admin-stop' and updated_at=$1 returning *", [initial.updated_at]);
  check(changed.length === 1 && changed[0].latitude === 55.861234, 'Admin update persists coordinates and publication');
  check((await rows("update public.glasgow_attractions set name='Stale change' where id='test-admin-stop' and updated_at=$1 returning id", [initial.updated_at])).length === 0, 'Stale edits cannot overwrite newer changes');
  await as('anon');
  check((await rows("select * from public.glasgow_attractions where id='test-admin-stop'")).length === 1, 'Published admin attraction visible to a separate anonymous session');
  await as('authenticated', admin);
  await db.exec("delete from public.glasgow_attractions where id='test-admin-stop'; delete from public.glasgow_attractions where id='celtic-park'");
  await as('anon');
  check((await rows("select id from public.glasgow_attractions where id='test-admin-stop'")).length === 0, 'Deleted attraction no longer public');
  await db.exec('reset role');
  await db.exec(setup);
  check((await rows("select id from public.glasgow_attractions where id='celtic-park'")).length === 0, 'Re-running setup never resurrects deleted seed entries');
  check((await rows("select theme from public.glasgow_attractions where id='custom-category-stop'"))[0].theme === 'Food & drink', 'Re-running setup preserves custom categories and their attractions');
  await db.exec(`delete from glasgow_walks_private.admin_users where user_id='${admin}'`);
  await as('authenticated', admin);
  check((await rows('select public.is_attraction_admin() as allowed'))[0].allowed === false, 'Revocation takes immediate effect');
  await denied(insert);
  await denied("insert into public.glasgow_attraction_categories (name) values ('Revoked category')");
  console.log(`Admin database checks passed: ${checks} actual PostgreSQL permission, validation, persistence, conflict and seed-idempotency checks. No remote database was modified.`);
} finally { await db.close(); }