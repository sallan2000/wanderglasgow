import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const fixture = resolve(root, 'tests/starting-areas');
const server = await createServer({
  configFile: false, root, cacheDir: resolve(root, 'node_modules/.vite-starting-areas'),
  plugins: [{
    name: 'isolated-starting-area-transport', enforce: 'pre',
    resolveId(id, importer) {
      if (id === './attraction-store' && (importer?.endsWith('/src/starting-area-store.ts') || importer?.endsWith('/src/WalkPlanner.tsx')))
        return resolve(fixture, 'transport.ts');
      if (id === './attraction-store' && importer?.startsWith(root) &&
          ['/src/AdminPortal.tsx', '/src/AdminAuth.tsx', '/src/AdminManager.tsx', '/src/AdminCategories.tsx', '/src/AdminEditor.tsx'].some(path => importer.endsWith(path)))
        return resolve(fixture, 'portal-transport.ts');
      if (id === './walk-planner' && importer?.endsWith('/src/WalkPlanner.tsx')) return resolve(fixture, 'planner.ts');
      if (id === './AdminWalks' && importer?.endsWith('/src/AdminPortal.tsx')) return resolve(fixture, 'walks-stub.tsx');
    },
  }, react(), tailwindcss()],
  esbuild: { target: 'es2022' },
  optimizeDeps: { entries: ['tests/starting-areas/index.html'], esbuildOptions: { target: 'es2022' } },
  server: { host: '127.0.0.1', port: 4182, strictPort: true },
});
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });