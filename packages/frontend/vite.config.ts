import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

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
  },
});
