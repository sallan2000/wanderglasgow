import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

// Only injected fake HTTP and isolated PostgreSQL. No owner credentials/network.
const temp = await mkdtemp(join(tmpdir(), 'walk-email-'));
const db = new PGlite();
let checks = 0;
const check = (value, message) => { assert(value, message); checks++; };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
try {
  for (const name of ['contract', 'itinerary', 'handler']) {
    const source = await readFile(`supabase/functions/send-walk-email/${name}.ts`, 'utf8');
    await writeFile(join(temp, `${name}.mjs`), ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText.replaceAll('.ts\'', '.mjs\''));
  }
  const { createEmailHandler } = await import(pathToFileURL(join(temp, 'handler.mjs')).href);
  const { validEmail, validateEmailRequest } = await import(pathToFileURL(join(temp, 'contract.mjs')).href);
  const env = { SUPABASE_URL: 'https://supabase.fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fake-service',
    RESEND_API_KEY: 'fake-resend', TURNSTILE_SECRET_KEY: 'fake-captcha', WALK_EMAIL_FROM: 'Wander Glasgow <walks@example.invalid>',
    WALK_EMAIL_HASH_SECRET: 'fixture-pepper-that-is-long-enough-12345', WALK_EMAIL_ALLOWED_ORIGINS: 'https://guide.fixture.invalid' };
  const attractions = [
    { id: 'first', name: 'First <script>alert(1)</script>', place: 'A & B', description: 'First published stop story.', latitude: 55.86, longitude: -4.25 },
    { id: 'last', name: 'Last stop', place: 'Glasgow', description: 'Second published stop story.', latitude: 55.87, longitude: -4.26 },
  ];
  const curated = { title: 'Curated Glasgow', subtitle: 'An editorial walk.', distance_km: 2.4, minutes: 33,
    stops: attractions.map(s => ({ name: s.name, place: s.place, story: s.description, lat: s.latitude, lon: s.longitude })) };
  let state;
  const reset = () => { state = { requests: [], accepted: new Map(), captcha: { success: true, action: 'walk-email', hostname: 'guide.fixture.invalid' },
    rate: true, providerStatus: 200, providerBody: { id: 'fake-message' }, rows: attractions, curated: [curated], dbStatus: 200, providerThrows: false }; };
  const fakeFetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    state.requests.push({ url: String(url), init, body });
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return json(state.captcha);
    if (url === 'https://api.resend.com/emails') {
      if (state.providerThrows) throw new Error('fake upstream error with private content');
      if (state.providerStatus === 200) state.accepted.set(init.headers['Idempotency-Key'], body);
      return json(state.providerBody, state.providerStatus);
    }
    const u = new URL(url);
    assert.equal(u.hostname, 'supabase.fixture.invalid', 'No unexpected external request');
    assert.equal(init.headers.apikey, 'fake-service');
    if (u.pathname.endsWith('/claim_walk_email_send')) {
      assert.match(body.recipient_hash, /^[0-9a-f]{64}$/);
      assert.deepEqual(Object.keys(body), ['recipient_hash']);
      return json(state.rate, state.dbStatus);
    }
    assert.equal(u.searchParams.get('published'), 'eq.true', 'Fetch published records only');
    if (u.pathname.endsWith('/glasgow_attractions')) return json(state.rows, state.dbStatus);
    if (u.pathname.endsWith('/glasgow_curated_walks')) return json(state.curated, state.dbStatus);
    assert.fail(`Unexpected endpoint ${u.pathname}`);
  };
  const handler = createEmailHandler({ env: name => env[name], fetch: fakeFetch });
  const planned = { kind: 'planned', origin: { lat: 55.859, lon: -4.251 }, stopIds: ['last', 'first'], distanceMeters: 1800, durationSeconds: 1500 };
  const input = { email: 'myself@example.invalid', requestId: '12345678-1234-4123-8123-123456789abc', token: 'fake-token', consent: true, walk: planned };
  const request = (body = input, overrides = {}) => {
    const headers = new Headers({ origin: 'https://guide.fixture.invalid', 'Content-Type': 'application/json' });
    for (const [key, value] of Object.entries(overrides)) headers.set(key, value);
    return new Request('https://function.fixture.invalid', { method: 'POST', headers, body: JSON.stringify(body) });
  };
  const outcome = async (body = input, headers) => {
    const response = await handler(request(body, headers));
    return { status: response.status, body: await response.json() };
  };
  const providerCalls = () => state.requests.filter(r => r.url === 'https://api.resend.com/emails');
  reset();
  assert.deepEqual(await outcome(), { status: 200, body: { status: 'accepted' } }); checks++;
  const message = providerCalls()[0].body;
  check(message.subject.includes('Calculated route'), 'Calculated route subject');
  check(message.text.includes('1. Last stop') && message.text.includes('2. First'), 'Exact requested stop order');
  check(message.text.includes('1.8 km') && message.text.includes('25 min'), 'Calculated metrics');
  check(message.text.includes('55.859000, -4.251000'), 'Explicitly consented precise origin');
  check(message.html.includes('&lt;script&gt;') && !message.html.includes('<script>'), 'HTML escaped');
  check(message.html.includes('A &amp; B'), 'Published address escaped');
  check(message.html.includes('max-width:600px') && message.text.includes('not turn-by-turn'), 'Mobile readable and honest itinerary');
  check(!('cc' in message) && !('bcc' in message) && message.to.length === 1, 'Single recipient only');
  await outcome({ ...input, token: 'new-single-use-token' });
  check(providerCalls().length === 2 && state.accepted.size === 1, 'Provider idempotency deduplicates retries');
  check(providerCalls()[0].init.headers['Idempotency-Key'] === providerCalls()[1].init.headers['Idempotency-Key'], 'Token excluded from idempotency reference');
  reset();
  await outcome({ ...input, walk: { kind: 'curated', walkId: 'current' } });
  const editorial = providerCalls()[0].body;
  check(editorial.subject.includes('Editorial curated walk') && editorial.text.includes('Curated Glasgow'), 'Curated email');
  check(editorial.text.includes('2.4 km') && editorial.text.includes('33 min') && !editorial.text.includes('55.859000'), 'Canonical curated origin/totals, no visitor GPS');
  for (const bad of [
    { ...input, email: 'first@example.invalid,other@example.invalid' }, { ...input, email: 'person@example.invalid\r\nBcc:evil@invalid.test' },
    { ...input, consent: false }, { ...input, token: '' }, { ...input, token: 'x'.repeat(2049) },
    { ...input, requestId: 'not-a-uuid' }, { ...input, html: '<p>spam</p>' },
    { ...input, walk: { ...planned, stopIds: [] } }, { ...input, walk: { ...planned, stopIds: ['first', 'first'] } },
    { ...input, walk: { ...planned, stopIds: Array.from({ length: 7 }, (_, i) => `${i}`) } },
    { ...input, walk: { ...planned, stopIds: ['bad,sql'] } }, { ...input, walk: { ...planned, distanceMeters: 15051 } },
    { ...input, walk: { ...planned, durationSeconds: -1 } }, { ...input, walk: { ...planned, origin: { lat: 91, lon: 0 } } },
    { ...input, walk: { ...planned, origin: { lat: 55, lon: 181 } } }, { ...input, walk: { kind: 'curated', walkId: 'x', subject: 'spam' } },
    { ...input, walk: { ...planned, geometry: {} } }, { ...input, huge: 'x'.repeat(9000) },
  ]) {
    reset(); check((await outcome(bad)).status === 400, 'Malformed/oversized request rejected');
    check(state.requests.length === 0, 'Invalid request cannot reach any provider');
  }
  assert.throws(() => validateEmailRequest({ ...input, walk: { ...planned, distanceMeters: NaN } })); checks++;
  check(!validEmail('.first@domain.test') && !validEmail('a..b@domain.test') && validEmail('a+walk@domain.test'), 'Email validation');
  reset(); check((await outcome(input, { origin: 'https://evil.fixture.invalid' })).status === 403 && state.requests.length === 0, 'Origin blocked');
  const preflight = await handler(new Request('https://fixture.invalid', { method: 'OPTIONS', headers: { origin: 'https://guide.fixture.invalid' } }));
  check(preflight.status === 204 && preflight.headers.get('Access-Control-Allow-Origin') === 'https://guide.fixture.invalid', 'CORS preflight');
  reset(); check((await outcome(input, { 'content-type': 'text/plain' })).status === 400, 'Content type enforced');
  for (const captcha of [{ success: false }, { success: true, action: 'other', hostname: 'guide.fixture.invalid' },
    { success: true, action: 'walk-email', hostname: 'evil.fixture.invalid' }]) {
    reset(); state.captcha = captcha;
    check((await outcome()).body.code === 'verification_failed' && providerCalls().length === 0, 'Captcha success/action/hostname enforced');
  }
  reset(); state.rate = false;
  check((await outcome()).status === 429 && providerCalls().length === 0, 'Limiter enforced');
  reset(); state.dbStatus = 404;
  check((await outcome()).body.code === 'setup_required' && providerCalls().length === 0, 'Missing limiter fails closed');
  reset(); state.rows = [attractions[0]];
  check((await outcome()).body.code === 'unavailable_walk' && providerCalls().length === 0, 'Missing/unpublished planned stop rejected');
  reset(); state.curated = [];
  check((await outcome({ ...input, walk: { kind: 'curated', walkId: 'removed' } })).body.code === 'unavailable_walk', 'Removed/unpublished curated walk rejected');
  for (const name of ['RESEND_API_KEY', 'TURNSTILE_SECRET_KEY', 'WALK_EMAIL_HASH_SECRET', 'WALK_EMAIL_FROM']) {
    reset(); const original = env[name]; delete env[name];
    check((await outcome()).body.code === 'setup_required' && state.requests.length === 0, 'Missing configuration fails closed');
    env[name] = original;
  }
  reset(); state.providerStatus = 422; state.providerBody = { message: 'fake private provider error' };
  const rejected = await outcome();
  check(rejected.status === 502 && rejected.body.code === 'provider_rejected' && !JSON.stringify(rejected).includes('private'), 'Provider rejection redacted, never accepted');
  reset(); state.providerThrows = true;
  check((await outcome()).body.code === 'delivery_unconfirmed', 'Uncertain provider send explained');
  reset(); state.providerBody = {};
  check((await outcome()).body.code === 'delivery_unconfirmed', 'No success without provider ID');
  reset(); state.providerStatus = 409;
  check((await outcome()).body.code === 'walk_changed', 'Changed retry body conflicts safely');
  reset(); state.providerStatus = 500;
  check((await outcome()).body.code === 'delivery_unconfirmed', 'Provider 5xx does not claim success');

  // Client transport and payload builders: use actual compiled code, fake fetch.
  let clientSource = await readFile('src/walk-email.ts', 'utf8');
  clientSource = clientSource.replaceAll('import.meta.env.VITE_SUPABASE_URL', JSON.stringify('https://supabase.fixture.invalid'))
    .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', JSON.stringify('sb_publishable_fixture'))
    .replaceAll('import.meta.env.VITE_TURNSTILE_SITE_KEY', JSON.stringify('public-fixture'));
  const clientJS = ts.transpileModule(clientSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('../supabase/functions/send-walk-email/contract', './contract.mjs');
  await writeFile(join(temp, 'client.mjs'), clientJS);
  const client = await import(pathToFileURL(join(temp, 'client.mjs')).href);
  const originalFetch = globalThis.fetch;
  try {
    const sent = [];
    globalThis.fetch = async (url, init) => { sent.push({ url, init }); return json({ status: 'accepted' }); };
    await client.sendWalkEmail(planned, input.email, input.token, input.requestId);
    check(sent[0].url.endsWith('/functions/v1/send-walk-email') && JSON.parse(sent[0].init.body).consent === true, 'Real client endpoint/consent contract');
    check(!('Authorization' in sent[0].init.headers), 'No admin session credential sent');
    for (const [status, value, code] of [[422, { code: 'provider_rejected' }, 'provider_rejected'], [404, {}, 'setup_required'], [200, {}, 'delivery_unconfirmed']]) {
      globalThis.fetch = async () => json(value, status);
      await assert.rejects(client.sendWalkEmail(planned, input.email, input.token, input.requestId), e => e.code === code); checks++;
    }
    globalThis.fetch = async () => { throw new Error('Offline'); };
    await assert.rejects(client.sendWalkEmail(planned, input.email, input.token, input.requestId), e => e.code === 'delivery_unconfirmed'); checks++;
    const payload = client.plannedEmailWalk({ ...planned, theme: 'All', stops: [{ id: 'first' }], nearby: ['private'], geometry: { coordinates: [1] } });
    check(!('geometry' in payload) && !('nearby' in payload) && payload.stopIds[0] === 'first', 'Minimal planned payload');
    assert.deepEqual(client.curatedEmailWalk({ id: 'curated', stops: ['unused'], title: 'unused' }), { kind: 'curated', walkId: 'curated' }); checks++;
  } finally { globalThis.fetch = originalFetch; }

  // Real PostgreSQL privilege and limiter behavior, not a SQL text assertion.
  await db.exec('create role anon; create role authenticated; create role service_role;');
  const sql = await readFile('supabase/email-delivery.sql', 'utf8');
  await db.exec(sql);
  const hash = 'a'.repeat(64);
  const claim = async value => (await db.query('select public.claim_walk_email_send($1) as allowed', [value])).rows[0].allowed;
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(claim(hash), e => e.code === '42501'); checks++;
    await assert.rejects(db.query('select * from glasgow_walks_private.walk_email_limits'), e => e.code === '42501'); checks++;
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  check(await claim(hash), 'Service role can claim'); check(await claim(hash), 'Second accepted'); check(await claim(hash), 'Third accepted');
  check(!await claim(hash), 'Fourth recipient attempt denied');
  await assert.rejects(claim('raw@example.invalid'), e => e.code === '22023'); checks++;
  await db.exec('reset role');
  await db.exec(sql);
  check(!await claim(hash), 'Re-runnable setup preserves counters');
  const columns = (await db.query("select column_name from information_schema.columns where table_name='walk_email_limits' order by ordinal_position")).rows.map(x => x.column_name);
  assert.deepEqual(columns, ['bucket', 'started_at', 'attempts']); checks++;
  await db.exec('truncate glasgow_walks_private.walk_email_limits');
  for (let i = 0; i < 100; i++) check(await claim(i.toString(16).padStart(64, '0')), 'Global accepted capacity');
  check(!await claim('b'.repeat(64)), 'Global 101st attempt denied');
  await db.exec("update glasgow_walks_private.walk_email_limits set started_at = now() - interval '3 hours'");
  check(await claim(hash), 'Expired capacity resets');
  check((await db.query('select count(*)::int as n from glasgow_walks_private.walk_email_limits')).rows[0].n === 2, 'Old rate keys pruned');
  console.log(`Walk email checks passed (${checks}); no real messages or owner data accessed.`);
} finally { await db.close(); await rm(temp, { recursive: true, force: true }); }