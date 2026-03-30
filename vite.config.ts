import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import manifest from './src/manifest.json';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        collector: resolve(__dirname, 'src/collector/index.html'),
        whitelist: resolve(__dirname, 'src/whitelist/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@features': resolve(__dirname, 'src/features'),
    },
  },
});
