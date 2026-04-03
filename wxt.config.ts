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
