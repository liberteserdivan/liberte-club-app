import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Capacitor WebView'da mutlak yollar bazen kırılır; göreli yollar daha güvenilir
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Büyük vendor kütüphanelerini ayır — ana paket küçülür, önbellek
        // sürümler arası korunur, WebView parçaları paralel ayrıştırır.
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  }
});
