import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Separate, plain Vite build used only to produce a static bundle for the
// Tauri desktop wrapper. Deliberately does not go through vinext/Next's
// SSR/RSC pipeline (see vite.config.ts) — the drone engine is 100%
// client-side, so Tauri just needs a static index.html + JS + CSS it can
// load directly in its webview, no server involved.
const tauriDevPort = 5183;

export default defineConfig({
  root: 'tauri-src',
  publicDir: '../public',
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  clearScreen: false,
  server: {
    port: tauriDevPort,
    strictPort: true,
  },
  build: {
    outDir: '../dist-tauri',
    emptyOutDir: true,
  },
});
