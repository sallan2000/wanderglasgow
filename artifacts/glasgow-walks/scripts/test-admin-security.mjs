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
    alter table public.glasgow_curated_walks drop constraint glasgow_curated_walks_theme_fkey;
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
  const walkUpgrade = await readFile('public/curated-walks-upgrade.sql', 'utf8');
  const originalWalks = await rows('select * from public.glasgow_curated_walks order by id');
  await db.exec(walkUpgrade);
  await db.exec(walkUpgrade);
  assert.deepEqual(await rows('select * from public.glasgow_curated_walks order by id'), originalWalks);
  checks++;
  const areaUpgrade = await readFile('public/starting-areas-upgrade.sql', 'utf8');
  const beforeAreas = await rows('select * from public.glasgow_attractions order by id');
  // Simulate an existing installation with no starting-area extension.
  await db.exec("drop table public.glasgow_starting_areas; delete from glasgow_walks_private.seed_history where seed_key='initial-starting-areas'");
  await db.exec(areaUpgrade);
  assert.deepEqual(await rows('select * from public.glasgow_attractions order by id'), beforeAreas); checks++;
  assert.deepEqual(await rows('select * from public.glasgow_curated_walks order by id'), originalWalks); checks++;
  check((await rows('select * from glasgow_walks_private.admin_users')).length === 1, 'Area upgrade preserves admin access');
  const seededAreas = await rows('select id,name,latitude,longitude from public.glasgow_starting_areas order by id');
  assert.deepEqual(seededAreas, [
    { id: 'centre', name: 'City centre', latitude: 55.8609, longitude: -4.2514 },
    { id: 'east', name: 'East End', latitude: 55.8545, longitude: -4.2372 },
    { id: 'west', name: 'West End', latitude: 55.8745, longitude: -4.2916 },
  ]); checks++;
  await as('anon');
  check((await rows('select * from public.glasgow_starting_areas')).length === 3, 'Visitors read starting points');
  const areaInsert = "insert into public.glasgow_starting_areas(id,name,latitude,longitude) values ('station','Central Station',55.859,-4.258)";
  await denied(areaInsert);
  await denied("update public.glasgow_starting_areas set name='Forged origin'");
  await denied('delete from public.glasgow_starting_areas');
  await as('authenticated', ordinary);
  await denied(areaInsert);
  check((await rows("update public.glasgow_starting_areas set name='Forged origin' returning id")).length === 0, 'Non-admin cannot reposition or rename areas');
  check((await rows('delete from public.glasgow_starting_areas returning id')).length === 0, 'Non-admin cannot delete areas');
  await as('authenticated', admin);
  await db.exec(areaInsert);
  await denied(areaInsert.replace("'station'", "'duplicate'").replace("'Central Station'", "'central station'"), '23505');
  for (const assignment of ["latitude=91", "longitude=-181", "latitude='NaN'", "longitude='Infinity'", "name='x'", "name=repeat('x',81)", "name=' City centre '", "name='My location'"]) {
    await denied(`update public.glasgow_starting_areas set ${assignment} where id='station'`, '23514');
  }
  const areaBefore = (await rows("select * from public.glasgow_starting_areas where id='station'"))[0];
  const moved = await rows("update public.glasgow_starting_areas set name='Station square',latitude=55.8595,longitude=-4.2585 where id='station' and updated_at=$1 returning *", [areaBefore.updated_at]);
  check(moved.length === 1 && moved[0].latitude === 55.8595, 'Admin rename and reposition persist');
  check((await rows("update public.glasgow_starting_areas set name='Stale' where id='station' and updated_at=$1 returning id", [areaBefore.updated_at])).length === 0, 'Stale area edits rejected');
  check((await rows("delete from public.glasgow_starting_areas where id='station' and updated_at=$1 returning id", [areaBefore.updated_at])).length === 0, 'Stale area deletes rejected');
  await as('anon');
  check((await rows("select name,latitude from public.glasgow_starting_areas where id='station'"))[0].name === 'Station square', 'Separate public session sees new origin');
  await as('authenticated', admin);
  await db.exec("delete from public.glasgow_starting_areas where id='west'; update public.glasgow_starting_areas set latitude=55.861 where id='centre'");
  await db.exec('reset role');
  await db.exec(areaUpgrade);
  await db.exec(setup);
  check((await rows("select id from public.glasgow_starting_areas where id='west'")).length === 0, 'Repeated upgrade and fresh setup do not resurrect deleted areas');
  check((await rows("select latitude from public.glasgow_starting_areas where id='centre'"))[0].latitude === 55.861, 'Repeated setup preserves moved origins');
  await as('authenticated', admin);
  await db.exec('delete from public.glasgow_starting_areas');
  await db.exec('reset role');
  await db.exec(areaUpgrade);
  await as('anon');
  check((await rows('select * from public.glasgow_starting_areas')).length === 0, 'An intentionally empty area list remains empty on upgrade');
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
  check((await rows('select * from public.glasgow_curated_walks')).length === 8, 'Original curated walks are preserved and publicly visible');
  await denied("insert into public.glasgow_curated_walks (id,title,theme) values ('forged-walk','Forged walk','Art')");
  await denied("update public.glasgow_curated_walks set title='Forged title'");
  await denied("delete from public.glasgow_curated_walks");

  await as('authenticated', ordinary);
  check((await rows('select public.is_attraction_admin() as allowed'))[0].allowed === false, 'Ordinary signed-in account is not admin');
  await denied(insert);
  await denied("insert into public.glasgow_attraction_categories (name) values ('Forged category')");
  await denied(`insert into glasgow_walks_private.admin_users values ('${ordinary}')`);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({user_metadata:{admin:true,role:'admin'}})]);
  check((await rows('select public.is_attraction_admin() as allowed'))[0].allowed === false, 'Self-supplied metadata cannot grant admin rights');
  check((await rows("update public.glasgow_attractions set name = 'Unauthorised edit' returning id")).length === 0, 'Non-admin update matches no editable rows');
  check((await rows('delete from public.glasgow_attractions returning id')).length === 0, 'Non-admin delete matches no editable rows');
  await denied("insert into public.glasgow_curated_walks (id,title,theme) values ('forged-walk','Forged walk','Art')");
  check((await rows("update public.glasgow_curated_walks set title='Unauthorised change' returning id")).length === 0, 'Non-admin cannot update curated walks');
  check((await rows('delete from public.glasgow_curated_walks returning id')).length === 0, 'Non-admin cannot delete curated walks');

  await as('authenticated', admin);
  const snapshotStops = originalWalks[0].stops.slice(0, 2);
  await db.query("insert into public.glasgow_curated_walks (id,title,subtitle,theme,stops) values ($1,$2,$3,$4,$5::jsonb)",
    ['test-walk', 'Test curated walk', 'An original description of this curated walk.', 'Art', JSON.stringify(snapshotStops)]);
  const draftWalk = (await rows("select * from public.glasgow_curated_walks where id='test-walk'"))[0];
  check(draftWalk.published === false && draftWalk.stops.length === 2, 'Admin can save an ordered draft walk');
  await as('anon');
  check((await rows("select id from public.glasgow_curated_walks where id='test-walk'")).length === 0, 'Draft curated walks are hidden from anonymous visitors');
  await as('authenticated', ordinary);
  check((await rows("select id from public.glasgow_curated_walks where id='test-walk'")).length === 0, 'Draft curated walks are hidden from ordinary signed-in users');
  await as('authenticated', admin);
  await denied("update public.glasgow_curated_walks set published=true where id='test-walk'", '23514');
  await denied("update public.glasgow_curated_walks set stops='{}'::jsonb where id='test-walk'", '23514');
  await denied("update public.glasgow_curated_walks set stops='[{\"name\":\"Stop\",\"story\":\"A sufficiently long story\",\"place\":\"\",\"lat\":91,\"lon\":0}]'::jsonb where id='test-walk'", '23514');
  await denied("update public.glasgow_curated_walks set stops='[{\"name\":\"Stop\",\"story\":\"A sufficiently long story\",\"place\":\"\",\"lat\":null,\"lon\":0}]'::jsonb where id='test-walk'", '23514');
  await denied("update public.glasgow_curated_walks set distance_km='NaN' where id='test-walk'", '23514');
  await denied("update public.glasgow_curated_walks set theme='No such category' where id='test-walk'", '23503');
  const publishedWalk = await rows("update public.glasgow_curated_walks set published=true,distance_km=2.1,minutes=29 where id='test-walk' and updated_at=$1 returning *", [draftWalk.updated_at]);
  check(publishedWalk.length === 1, 'Publishing with valid walking metrics persists');
  check((await rows("update public.glasgow_curated_walks set title='Stale edit' where id='test-walk' and updated_at=$1 returning id", [draftWalk.updated_at])).length === 0, 'Stale curated-walk edits cannot overwrite a newer version');
  await as('anon');
  const visibleWalk = (await rows("select * from public.glasgow_curated_walks where id='test-walk'"))[0];
  assert.deepEqual(visibleWalk.stops, snapshotStops); checks++;
  check(visibleWalk.distance_km === 2.1 && visibleWalk.minutes === 29, 'A separate public session sees published walking metrics');
  await as('authenticated', admin);
  await db.query("update public.glasgow_curated_walks set stops=$1::jsonb where id='test-walk'", [JSON.stringify([...snapshotStops].reverse())]);
  assert.deepEqual((await rows("select stops from public.glasgow_curated_walks where id='test-walk'"))[0].stops, [...snapshotStops].reverse()); checks++;
  const beforeSourceChange = (await rows("select stops from public.glasgow_curated_walks where id='test-walk'"))[0].stops;
  await db.query("update public.glasgow_attractions set description='A new attraction description that does not rewrite an existing curated walk.' where name=$1", [snapshotStops[0].name]);
  assert.deepEqual((await rows("select stops from public.glasgow_curated_walks where id='test-walk'"))[0].stops, beforeSourceChange); checks++;
  await db.exec("update public.glasgow_curated_walks set published=false where id='test-walk'");
  await as('anon');
  check((await rows("select id from public.glasgow_curated_walks where id='test-walk'")).length === 0, 'Unpublishing removes a curated walk from visitors');
  await as('authenticated', admin);
  const attractionCount = (await rows('select count(*)::integer as n from public.glasgow_attractions'))[0].n;
  await db.exec("delete from public.glasgow_curated_walks where id='test-walk'; delete from public.glasgow_curated_walks where id='art-mile'");
  check((await rows('select count(*)::integer as n from public.glasgow_attractions'))[0].n === attractionCount, 'Deleting a curated walk never deletes source attractions');
  await db.exec("update public.glasgow_curated_walks set subtitle='An edited original walk description that must survive repeated upgrades.' where id='kelvingrove-culture'");
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
  await db.exec(walkUpgrade);
  check((await rows("select id from public.glasgow_curated_walks where id='art-mile'")).length === 0, 'Re-running upgrades never resurrects deleted original walks');
  check((await rows("select subtitle from public.glasgow_curated_walks where id='kelvingrove-culture'"))[0].subtitle.startsWith('An edited'), 'Re-running upgrades preserves edits to original walks');
  await db.exec(`delete from glasgow_walks_private.admin_users where user_id='${admin}'`);
  await as('authenticated', admin);
  check((await rows('select public.is_attraction_admin() as allowed'))[0].allowed === false, 'Revocation takes immediate effect');
  await denied(insert);
  await denied("insert into public.glasgow_attraction_categories (name) values ('Revoked category')");
  await denied("insert into public.glasgow_curated_walks (id,title,theme) values ('revoked-walk','Revoked walk','Art')");
  console.log(`Admin database checks passed: ${checks} actual PostgreSQL permission, validation, persistence, conflict and seed-idempotency checks. No remote database was modified.`);
} finally { await db.close(); }