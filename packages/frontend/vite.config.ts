import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Optional HTTPS for LAN testing.
 *
 * Browsers only expose getUserMedia and WebCrypto on a secure origin, and
 * `http://<lan-ip>` is not one — so a second device cannot join a call over
 * plain HTTP. Dropping a self-signed key/cert into `certs/` serves the dev
 * server over TLS instead, which makes the origin secure. Absent the files
 * this is a no-op and the server stays on HTTP.
 */
const certDir = fileURLToPath(new URL('./certs', import.meta.url));
const keyPath = `${certDir}/key.pem`;
const certPath = `${certDir}/cert.pem`;
const https =
  existsSync(keyPath) && existsSync(certPath)
    ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    : undefined;

const BACKEND = process.env.DEV_BACKEND_URL ?? 'http://127.0.0.1:8080';
const LIVEKIT = process.env.DEV_LIVEKIT_URL ?? 'ws://127.0.0.1:7880';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
      '@components': fileURLToPath(
        new URL('./src/components', import.meta.url)
      ),
      '@hooks': fileURLToPath(new URL('./src/hooks', import.meta.url)),
      '@api': fileURLToPath(new URL('./src/api', import.meta.url)),
      '@context': fileURLToPath(new URL('./src/context', import.meta.url)),
      '@styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    https,
    /**
     * Everything is served from this one origin, so the browser makes no
     * cross-origin request at all: no CORS, no third-party cookie rules, and
     * only one certificate for a LAN guest to accept.
     */
    proxy: {
      '/api': { target: BACKEND, changeOrigin: false },
      '/auth': { target: BACKEND, changeOrigin: false },
      '/health': { target: BACKEND, changeOrigin: false },
      // LiveKit signalling. `ws: true` upgrades the socket; the prefix is
      // stripped because the SFU serves /rtc at its own root.
      '/livekit': {
        target: LIVEKIT,
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/livekit/, ''),
      },
    },
  },
});
