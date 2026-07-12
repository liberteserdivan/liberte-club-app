import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// app-v2 cutover — Capacitor webDir=dist ayni kalir
export default defineConfig({
  root: path.join(rootDir, 'app-v2'),
  publicDir: path.join(rootDir, 'public'),
  plugins: [react()],
  base: './',
  build: {
    outDir: path.join(rootDir, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom']
        }
      }
    }
  },
  server: {
    fs: { allow: [rootDir] }
  }
});