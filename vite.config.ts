import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'nibble-dev-csp',
    apply: 'serve',
    // React's development refresh preamble is inline; production retains strict script-src.
    transformIndexHtml: html => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';"),
  }],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { sourcemap: true },
});
