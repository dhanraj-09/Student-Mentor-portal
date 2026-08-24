import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node, not jsdom: everything under test is server-side.
    environment: 'node',
    globals: false,
    // Loads the environment the config module demands before any test module
    // (and therefore before `config.ts`) is imported.
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types/**'],
    },
  },
});
