import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'dist*/**',
      'coverage/**',
      'graphify-out/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.ts', 'entrypoints/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'no-console': 'error',
    },
  },
  {
    // Aside REPL에서 페이지와 함께 실행하는 점검 스크립트 (scripts/x-dom/README.md)
    files: ['scripts/x-dom/**/*.js'],
    languageOptions: {
      globals: {
        openTab: 'readonly', closeTab: 'readonly', sleep: 'readonly',
        window: 'readonly', document: 'readonly', history: 'readonly', innerHeight: 'readonly',
        getComputedStyle: 'readonly', requestAnimationFrame: 'readonly', setTimeout: 'readonly', console: 'readonly',
        MutationObserver: 'readonly', PerformanceObserver: 'readonly', performance: 'readonly', HTMLElement: 'readonly',
      },
    },
  },
  {
    files: ['src/injected/**/*.ts', 'src/shared/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
