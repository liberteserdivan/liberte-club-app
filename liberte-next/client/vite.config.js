import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset paths — Capacitor webDir uyumu
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // Aynı origin n-* uçları — yerel Vite → production API
      '/api': {
        target: process.env.LIBERTE_NEXT_API_PROXY || 'https://app.libertegastrocafe.com',
        changeOrigin: true,
        secure: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
