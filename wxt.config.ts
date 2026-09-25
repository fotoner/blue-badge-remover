import { defineConfig } from 'wxt';
import { resolve } from 'path';

export default defineConfig({
  srcDir: '.',
  outDir: 'dist',
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'ko',
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: [
      'https://x.com/*',
      'https://api.x.com/*',
      'https://twitter.com/*',
      'https://api.twitter.com/*',
    ],
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    web_accessible_resources: [
      {
        resources: ['icons/icon48.png'],
        matches: ['https://x.com/*', 'https://twitter.com/*'],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: 'blue-badge-remover@fotone',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
  zip: {
    // AMO 소스 ZIP에서 로컬 전용 산출물 제외 (숨김 파일·node_modules·테스트·outDir은 WXT 기본 제외)
    excludeSources: ['dist-firefox/**', 'graphify-out/**', 'test-results/**', 'release/**'],
  },
  vite: () => ({
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@features': resolve(__dirname, 'src/features'),
      },
    },
  }),
});
