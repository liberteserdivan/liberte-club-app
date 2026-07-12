import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ACIL: app-v2 native crash sonrasi gecici olarak stabil v1 istemci
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"]
        }
      }
    }
  }
});