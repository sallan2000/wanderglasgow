import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const temp = await mkdtemp(join(tmpdir(), 'glasgow-access-'));
const db = new PGlite();
const fresh = new PGlite();
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const admin = '11111111-1111-4111-8111-111111111111';
const visitor = '22222222-2222-4222-8222-222222222222';
const replies = [], requests = [];
globalThis.__accessClient = {
  from(table) {
    const call = { table, actions: [] }; requests.push(call);
    const query = { then(resolve, reject) { return Promise.resolve(replies.shift()).then(resolve, reject); } };
    for (const name of ['select', 'order', 'range', 'eq', 'abortSignal', 'update', 'insert', 'single', 'maybeSingle']) {
      query[name] = (...args) => { call.actions.push([name, ...args]); return query; };
    }
    return query;
  },
};
try {
  for (const name of ['tours', 'attractions', 'access-details', 'attraction-store', 'walk-planner', 'efficient-walk-order']) {
    let source = await readFile(`src/${name}.ts`, 'utf8');
    if (name === 'attraction-store') source = source
      .replace("import { createClient } from '@supabase/supabase-js';", 'const createClient = () => globalThis.__accessClient;')
      .replaceAll('import.meta.env.VITE_SUPABASE_URL', '"https://fixture.invalid"')
      .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', '"public-fixture"');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
    await writeFile(join(temp, `${name}.mjs`), output);
  }
  const load = name => import(pathToFileURL(join(temp, `${name}.mjs`)).href);
  const { unknownAccess, validateAccessDetails, matchesAccessPreference } = await load('access-details');
  const store = await load('attraction-store');
  const { planAttractionWalk } = await load('walk-planner');
  const unknown = unknownAccess();
  equal(validateAccessDetails(), unknown, 'Old inputs default to unknown');
  const yes = { stepFree: 'yes', accessibleToilet: 'no', seating: 'unknown', notes: '  Narrow doorway  ' };
  equal(validateAccessDetails(yes).notes, 'Narrow doorway');
  for (const value of [null, [], {}, { ...yes, stepFree: true }, { ...yes, accessibleToilet: 'maybe' }, { ...yes, seating: 'YES' }, { ...yes, notes: null }, { ...yes, notes: 'x'.repeat(1501) }]) {
    assert.throws(() => validateAccessDetails(value)); checks++;
  }
  equal(validateAccessDetails({ ...yes, notes: 'x'.repeat(1500) }).notes.length, 1500);
  for (const access of [undefined, unknown, { ...yes, stepFree: 'no' }]) {
    equal(matchesAccessPreference(access, 'step-free'), false);
    equal(matchesAccessPreference(access, 'any'), true);
  }
  equal(matchesAccessPreference(yes, 'step-free'), true);
  const oldRow = { id: 'old', name: 'Old attraction', description: 'A long enough description.', place: 'Glasgow',
    theme: 'History', latitude: 55.86, longitude: -4.25, published: true, updated_at: '2026-10-01T00:00:00Z' };
  replies.push({ data: [oldRow], error: null });
  const old = (await store.loadPublicCatalogue()).attractions[0];
  equal(old.access, unknown, 'Read old database rows without requiring an upgrade');
  equal(requests.at(-1).actions.some(a => a[0] === 'eq' && a[1] === 'published' && a[2] === true), true);
  equal(store.validateAttraction({ ...old }).access, unknown);
  assert.throws(() => store.validateAttraction({ ...old, access: { ...yes, notes: 'x'.repeat(1501) } }), store.CatalogueError); checks++;
  const newRow = { ...oldRow, step_free_access: 'yes', accessible_toilet: 'no', seating: 'unknown', access_notes: 'Narrow doorway' };
  replies.push({ data: newRow, error: null });
  const saved = await store.saveAttraction({ ...old, access: yes }, old);
  equal(saved.access, { ...yes, notes: 'Narrow doorway' });
  const update = requests.at(-1).actions.find(a => a[0] === 'update')[1];
  equal([update.step_free_access, update.accessible_toilet, update.seating, update.access_notes],
    ['yes', 'no', 'unknown', 'Narrow doorway'], 'Request includes saved access fields');
  equal(requests.at(-1).actions.some(a => a[0] === 'eq' && a[1] === 'updated_at' && a[2] === old.updatedAt), true);
  replies.push({ data: null, error: { code: 'PGRST204' } });
  await assert.rejects(store.saveAttraction({ ...old, access: yes }, old), /access-details-upgrade.sql/); checks++;
  let fetches = 0;
  globalThis.fetch = async url => {
    fetches++;
    const u = new URL(url);
    if (u.pathname.includes('/table/')) {
      equal(u.pathname.split('/').at(-1).split(';').length, 2, 'Only confirmed step-free attraction is sent');
      return { ok: true, json: async () => ({ code: 'Ok', distances: [[0, 100], [100, 0]] }) };
    }
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 100, duration: 80,
      geometry: { type: 'LineString', coordinates: [[-4.25, 55.86], [-4.251, 55.861]] } }] }) };
  };
  const catalog = [old, { ...old, id: 'no', access: { ...yes, stepFree: 'no' } },
    { ...old, id: 'yes', lat: 55.861, lon: -4.251, access: yes }];
  const options = { theme: 'All', radiusKm: 1, maxStops: 3, accessPreference: 'step-free' };
  const planned = await planAttractionWalk(old, options, undefined, catalog);
  equal(planned.stops.map(s => s.id), ['yes']);
  equal(planned.accessPreference, 'step-free');
  const before = fetches;
  await assert.rejects(planAttractionWalk(old, options, undefined, [old]), /Unknown access is excluded/); checks++;
  equal(fetches, before, 'No provider call for no matching access details');
  await assert.rejects(planAttractionWalk(old, { ...options, accessPreference: 'bogus' }, undefined, catalog), /access preference/); checks++;

  const bootstrap = async database => database.exec(`
    create role anon noinherit; create role authenticated noinherit;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values ('${admin}','owner@example.invalid'),('${visitor}','visitor@example.invalid');
  `);
  await bootstrap(db);
  await db.exec(await readFile('supabase/schema.sql', 'utf8') + '\ncommit;');
  await db.exec(`insert into glasgow_walks_private.admin_users values ('${admin}');
    insert into public.glasgow_attractions(id,name,description,theme,latitude,longitude,published)
    values ('old','Old attraction','An original description','History',55.86,-4.25,true),
      ('draft','Hidden attraction','An original draft description','History',55.86,-4.25,false);`);
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const prior = await query('select id,name,description,published,created_at,updated_at from public.glasgow_attractions order by id');
  const policies = await query("select * from pg_policies where tablename='glasgow_attractions'");
  const upgrade = await readFile('public/access-details-upgrade.sql', 'utf8');
  await db.exec(upgrade); await db.exec(upgrade);
  equal(await query('select id,name,description,published,created_at,updated_at from public.glasgow_attractions order by id'), prior);
  equal(await query("select * from pg_policies where tablename='glasgow_attractions'"), policies, 'Upgrade leaves policies intact');
  equal((await query('select step_free_access,accessible_toilet,seating,access_notes from public.glasgow_attractions'))[0],
    { step_free_access: 'unknown', accessible_toilet: 'unknown', seating: 'unknown', access_notes: '' });
  const as = async (role, user = '') => {
    await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec(`set role ${role}`);
  };
  await as('anon');
  equal((await query('select * from public.glasgow_attractions')).length, 1);
  await assert.rejects(db.exec("update public.glasgow_attractions set step_free_access='yes'"), e => e.code === '42501'); checks++;
  await as('authenticated', visitor);
  equal((await query("update public.glasgow_attractions set step_free_access='yes' returning id")).length, 0);
  await assert.rejects(db.exec("insert into public.glasgow_attractions(id,name,description,theme,latitude,longitude) values ('fake','Fake access','Unapproved description','History',55,-4)"), e => e.code === '42501'); checks++;
  await as('authenticated', admin);
  await db.exec("update public.glasgow_attractions set step_free_access='yes',accessible_toilet='no',seating='yes',access_notes='Owner note' where id='old'");
  for (const assignment of ["step_free_access='maybe'", "accessible_toilet='YES'", "seating=''", "access_notes=repeat('x',1501)", 'step_free_access=null']) {
    await assert.rejects(db.exec(`update public.glasgow_attractions set ${assignment} where id='old'`), e => ['23514', '23502'].includes(e.code)); checks++;
  }
  await db.exec("update public.glasgow_attractions set access_notes=repeat('x',1500) where id='old'");
  await as('anon');
  equal((await query("select step_free_access,seating,length(access_notes) as length from public.glasgow_attractions where id='old'"))[0],
    { step_free_access: 'yes', seating: 'yes', length: 1500 }, 'Public session sees saved owner details');
  await db.exec('reset role');
  const preserved = await query('select * from public.glasgow_attractions order by id');
  await db.exec(upgrade);
  equal(await query('select * from public.glasgow_attractions order by id'), preserved, 'Rerun preserves edits');
  await bootstrap(fresh);
  const setup = await readFile('public/setup.sql', 'utf8');
  await fresh.exec(setup);
  equal((await fresh.query("select count(*)::int as count from public.glasgow_attractions where step_free_access='unknown' and access_notes=''")).rows[0].count, 27);
  await fresh.exec("update public.glasgow_attractions set seating='yes',access_notes='Retained on seed rerun' where id=(select id from public.glasgow_attractions limit 1)");
  await fresh.exec(setup);
  equal((await fresh.query("select count(*)::int as count from public.glasgow_attractions where access_notes='Retained on seed rerun' and seating='yes'")).rows[0].count, 1);
  console.log(`Access details checks passed (${checks}): validation, legacy defaults, transport, filtering, owner upgrade/fresh setup and real PostgreSQL permissions. No owner data or external services accessed.`);
} finally {
  delete globalThis.__accessClient;
  await db.close(); await fresh.close(); await rm(temp, { recursive: true, force: true });
}