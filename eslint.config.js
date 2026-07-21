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
    files: ['src/shared/i18n.ts'],
    rules: {
      'max-lines': 'off',
    },
  },
  {
    files: ['src/injected/**/*.ts', 'src/shared/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
