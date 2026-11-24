import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const port = Number(process.env.PORT || 5173);
const requestedBase = process.env.BASE_PATH || '/';
const basePath = requestedBase.startsWith('/') ? requestedBase : `/${requestedBase}`;
const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

export default defineConfig(({ mode }) => {
  // For a trusted remote proxy (including Replit), set DEV_SERVER_REMOTE=1 and
  // DEV_SERVER_ALLOWED_HOSTS=your-exact-host.example. CI/local need neither.
  // Do not expose this development server to the public.
  const remote = process.env.DEV_SERVER_REMOTE === '1';
  const allowedHosts = (process.env.DEV_SERVER_ALLOWED_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean);
  if (remote && (!allowedHosts.length || allowedHosts.some(host =>
    host.length > 253 || !host.includes('.') || !host.split('.').every(label =>
      /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(label)) || /^\d+(\.\d+)+$/.test(host)))) {
    throw new Error('DEV_SERVER_REMOTE=1 requires exact trusted DNS names in DEV_SERVER_ALLOWED_HOSTS (comma-separated, no wildcards, ports or URLs).');
  }
  const host = remote ? '0.0.0.0' : '127.0.0.1';
  const trustedHosts = remote ? allowedHosts : [];
  // Check the actual Vite mode before any VITE_* value enters a public bundle.
  const configuration = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const publicKey = configuration.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (publicKey) {
    let permitted = publicKey.startsWith('sb_publishable_');
    if (!permitted) {
      try { permitted = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* rejected below */ }
    }
    if (!permitted) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a public publishable or legacy anon key. Never supply a secret/service_role key.');
  }
  return {
  base: normalizedBase,
  plugins: [react(), tailwindcss(), {
    name: 'enforce-dev-server-host',
    configResolved(config) {
      if (config.command !== 'serve') return;
      // CLI options are merged after this config; reject host overrides.
      for (const options of [config.server, config.preview]) {
        if (options.host !== host || options.allowedHosts === true ||
            options.allowedHosts.some(value => !trustedHosts.includes(value))) {
          throw new Error('Dev/preview host settings were overridden; use DEV_SERVER_REMOTE and DEV_SERVER_ALLOWED_HOSTS instead.');
        }
      }
    },
  }],
  esbuild: { target: 'es2022' },
  optimizeDeps: {
    esbuildOptions: { target: 'es2022' },
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: process.cwd(),
  build: {
    target: 'es2022',
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port: Number.isFinite(port) && port > 0 ? port : 5173,
    strictPort: true,
    host,
    allowedHosts: trustedHosts,
    fs: {
      strict: true,
    },
  },
  preview: {
    port: Number.isFinite(port) && port > 0 ? port : 5173,
    host,
    allowedHosts: trustedHosts,
  },
  };
});
