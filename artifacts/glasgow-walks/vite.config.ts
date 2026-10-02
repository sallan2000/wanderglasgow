import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT || 5173);
const requestedBase = process.env.BASE_PATH || '/';
const basePath = requestedBase.startsWith('/') ? requestedBase : `/${requestedBase}`;
const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

export default defineConfig({
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
});
