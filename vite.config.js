import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Capacitor WebView'da mutlak yollar bazen kırılır; göreli yollar daha güvenilir
  base: './'
});
