import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.config.js',
      // Vendored MediaPipe runtime staged for background blur; not our source.
      '**/public/mediapipe/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      'no-console': 'warn',
    },
  },
  {
    files: ['packages/backend/**/*.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    files: ['packages/frontend/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
      },
    },
  }
);
