import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// Explicit public fixture configuration: never inherit the owner's VITE secrets.
const server = await createServer({
  configFile: false, root, cacheDir: resolve(root, 'node_modules/.vite-email-tests'),
  resolve: { alias: { '@': resolve(root, 'src') } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://supabase.fixture.invalid'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_fixture'),
  },
  plugins: [{
    name: 'email-fixture-public-key', enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/walk-email.ts')) return code.replaceAll('import.meta.env.VITE_TURNSTILE_SITE_KEY',
        '(new URLSearchParams(window.location.search).has("unconfigured") ? "" : "public-fixture")');
    },
  }, react(), tailwindcss()],
  esbuild: { target: 'es2022' },
  optimizeDeps: { entries: ['tests/email/index.html'], esbuildOptions: { target: 'es2022' } },
  server: { host: '127.0.0.1', port: 4185, strictPort: true },
});
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });