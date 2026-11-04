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
    // 데모 영상 키트 — 브라우저에서 releases/*.html이 불러 쓴다 (scripts/demo-video/README.md)
    files: ['scripts/demo-video/**/*.js'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', location: 'readonly', URLSearchParams: 'readonly' },
    },
  },
  {
    // 의존성 방향(AGENTS.md "구조"): shared는 아무것도 import하지 않는다
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        group: ['@features/*', '**/features/**', '**/content/**', '**/injected/**', '**/popup/**', '**/dashboard/**', '**/options/**', '**/whitelist/**', '**/collector/**'],
        message: 'src/shared는 다른 레이어를 import하지 않는다(AGENTS.md 구조)',
      }] }],
    },
  },
  {
    // 기능끼리는 서로 import하지 않고 shared(@shared)로 공유한다. 기능 폴더는 한 단계라 '../'는 곧 기능 밖이다
    files: ['src/features/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@features/*'], message: 'src/features는 다른 기능을 import하지 않는다(AGENTS.md 구조)' },
        { regex: '^\\.\\./', message: 'src/features는 기능 밖을 상대 경로로 import하지 않는다. 공유는 @shared로(AGENTS.md 구조)' },
      ] }],
    },
  },
  {
    // MAIN world 번들은 확장 API가 없는 페이지에서 돈다 — shared만 쓴다
    files: ['src/injected/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@features/*', 'wxt/browser'], message: 'src/injected는 src/shared만 쓴다(AGENTS.md 구조, CNT-7)' },
        { regex: '^\\.\\./', message: 'src/injected는 폴더 밖을 상대 경로로 import하지 않는다. 공유는 @shared로(AGENTS.md 구조, CNT-7)' },
      ] }],
    },
  },
  {
    // Node로 도는 검사·훅·QA 스크립트
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', setTimeout: 'readonly' },
    },
  },
  {
    files: ['src/injected/**/*.ts', 'src/shared/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
