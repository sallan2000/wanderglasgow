import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const fixtures = resolve(root, 'tests/walk-browser');
// This server has no app entry point or live Supabase configuration.
const server = await createServer({
  configFile: false,
  root,
  cacheDir: resolve(root, 'node_modules/.vite-walk-browser'),
  plugins: [
    {
      name: 'isolated-walk-components',
      enforce: 'pre',
      resolveId(id, importer) {
        if (importer?.endsWith('/src/AdminAuth.tsx') && id === './attraction-store')
          return resolve(fixtures, 'auth-transport.ts');
        if (importer?.endsWith('/src/AdminPortal.tsx') && id === './attraction-store')
          return resolve(fixtures, 'auth-transport.ts');
        if (importer?.endsWith('/src/WalkPlanner.tsx') && id === './walk-planner')
          return resolve(fixtures, 'planner-transport.ts');
        if (importer?.endsWith('/src/WalkPlanner.tsx') && id === './attraction-store')
          return resolve(fixtures, 'planner-catalogue.ts');
        if (importer?.endsWith('/src/AdminPortal.tsx') && (id === './AdminManager' || id === './AdminWalks'))
          return resolve(fixtures, 'portal-stub.tsx');
        if (importer?.endsWith('/src/AdminWalkEditor.tsx') &&
            (id === './walk-store' || id === './attraction-store'))
          return resolve(fixtures, 'transport.ts');
      },
      transform(source, id) {
        if (!id.endsWith('/src/AdminWalkEditor.tsx')) return;
        // No coordinate input exists in the shipped editor. Exercise its
        // routeKey effect through setStops, deliberately NOT calling invalidate.
        const anchor = '<form className="adm-form"';
        if (!source.includes(anchor)) throw new Error('Coordinate test seam no longer matches the editor');
        return source.replace(anchor, `<button type="button" data-testid="fixture-coordinate-edit"
          onClick={() => setStops(rows => rows.map((s, i) => i === 0 ? { ...s, lat: s.lat + 0.001 } : s))}>
          Change fixture coordinate</button>${anchor}`);
      },
    },
    react(),
    tailwindcss(),
  ],
  esbuild: { target: 'es2022' },
  optimizeDeps: {
    entries: ['tests/walk-browser/index.html'],
    esbuildOptions: { target: 'es2022' },
  },
  server: { host: '127.0.0.1', port: 4179, strictPort: true },
});
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await server.close(); process.exit(0); });
}