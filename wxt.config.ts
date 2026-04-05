import { defineConfig } from 'wxt';
import { resolve } from 'path';

export default defineConfig({
  srcDir: '.',
  outDir: 'dist',
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'ko',
    permissions: ['storage', 'unlimitedStorage', 'alarms'],
    host_permissions: [
      'https://x.com/*',
      'https://api.x.com/*',
      'https://twitter.com/*',
      'https://api.twitter.com/*',
      'https://raw.githubusercontent.com/fotoner/blue-badge-remover/*',
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
  vite: () => ({
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@features': resolve(__dirname, 'src/features'),
      },
    },
  }),
});
