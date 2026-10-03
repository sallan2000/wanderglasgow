import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const fixtures = resolve(root, 'tests/walk-browser');
const server = await createServer({
  configFile: false,
  root,
  cacheDir: resolve(root, 'node_modules/.vite-walk-list'),
  plugins: [
    {
      name: 'isolated-admin-walk-list',
      enforce: 'pre',
      resolveId(id, importer) {
        if ((importer?.endsWith('/src/AdminWalks.tsx') || importer?.endsWith('/src/AdminWalkEditor.tsx')) &&
            id === './walk-store')
          return resolve(fixtures, 'walk-list-walk-store.ts');
        if ((importer?.endsWith('/src/AdminWalks.tsx') || importer?.endsWith('/src/AdminWalkEditor.tsx')) &&
            id === './attraction-store')
          return resolve(fixtures, 'walk-list-attraction-store.ts');
      },
    },
    react(),
    tailwindcss(),
  ],
  esbuild: { target: 'es2022' },
  optimizeDeps: {
    entries: ['tests/walk-browser/admin-walks.html'],
    esbuildOptions: { target: 'es2022' },
  },
  server: { host: '127.0.0.1', port: 4180, strictPort: true },
});

await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await server.close(); process.exit(0); });
}