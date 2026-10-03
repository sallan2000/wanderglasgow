import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const port = Number(process.env.PORT || 5173);
const requestedBase = process.env.BASE_PATH || '/';
const basePath = requestedBase.startsWith('/') ? requestedBase : `/${requestedBase}`;
const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

export default defineConfig(({ mode }) => {
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
  plugins: [react(), tailwindcss()],
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
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port: Number.isFinite(port) && port > 0 ? port : 5173,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  };
});
