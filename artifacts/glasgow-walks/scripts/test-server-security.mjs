import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { createServer, preview, resolveConfig } from 'vite';

const original = { ...process.env };
const temp = await mkdtemp(join(tmpdir(), 'glasgow-vite-test-'));
await writeFile(join(temp, 'index.html'), '<!doctype html><title>fixture</title>');
function env(remote = false) {
  delete process.env.DEV_SERVER_REMOTE;
  delete process.env.DEV_SERVER_ALLOWED_HOSTS;
  delete process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS;
  if (remote) {
    process.env.DEV_SERVER_REMOTE = '1';
    process.env.DEV_SERVER_ALLOWED_HOSTS = 'trusted.example';
  }
}
async function checkServer(isPreview, remote) {
  env(remote);
  const options = { configFile: 'vite.config.ts', build: { outDir: temp }, optimizeDeps: { noDiscovery: true, include: [] },
    server: { port: 0, strictPort: false }, preview: { port: 0, strictPort: false } };
  const server = isPreview ? await preview(options) : await createServer(options);
  try {
    if (!isPreview) await server.listen();
    const address = server.httpServer.address();
    assert.equal(address.address, remote ? '0.0.0.0' : '127.0.0.1');
    const request = host => new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port: address.port, headers: { host }, agent: false }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
    });
    assert.equal(await request('localhost'), 200);
    assert.equal(await request('untrusted.example'), 403, `untrusted host, preview=${isPreview} remote=${remote}`);
    assert.equal(await request('trusted.example'), remote ? 200 : 403, `trusted host, preview=${isPreview} remote=${remote}`);
  } finally {
    if (isPreview) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
    else await server.close();
  }
}
try {
  for (const isPreview of [false, true]) for (const remote of [false, true]) await checkServer(isPreview, remote);
  for (const command of [[], ['preview']]) {
    for (const args of [['--host'], ['--host', '0.0.0.0']]) {
      env();
      const result = spawnSync(process.execPath, ['./node_modules/vite/bin/vite.js', ...command, '--config', 'vite.config.ts', ...args], { env: process.env, encoding: 'utf8', timeout: 10000 });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /host settings were overridden/);
    }
  }
  for (const value of ['', '*.example.com', '.example.com', 'https://example.com', 'example.com:443', '127.0.0.1']) {
    env(); process.env.DEV_SERVER_REMOTE = '1'; process.env.DEV_SERVER_ALLOWED_HOSTS = value;
    await assert.rejects(resolveConfig({ configFile: 'vite.config.ts', logLevel: 'silent' }, 'serve'), /requires exact trusted DNS names/);
  }
  env(); process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = 'evil.example';
  await assert.rejects(resolveConfig({ configFile: 'vite.config.ts' }, 'serve'), /host settings were overridden/);
  console.log('Server security: local/remote dev and preview, Host headers, CLI overrides and invalid opt-ins passed.');

} finally {
  for (const key of ['DEV_SERVER_REMOTE', 'DEV_SERVER_ALLOWED_HOSTS', '__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS']) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
  await rm(temp, { recursive: true, force: true });
}
// Vite plugins retain FS watchers even after test servers close. All assertions
// and cleanup above are awaited; terminate the isolated test process on success.
process.exit(0);
