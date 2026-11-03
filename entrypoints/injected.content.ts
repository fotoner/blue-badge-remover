// entrypoints/injected.content.ts — WXT MAIN world content script (fetch interceptor)
import { version } from '../package.json';
import { recordMainWorldStart } from '../src/injected/main-world-start';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    // MAIN world에는 runtime API가 없어 빌드 때 들어간 package.json 버전을 남긴다 (WXT manifest 버전과 같다)
    void import('../src/injected/fetch-interceptor').then(() => {
      recordMainWorldStart(document, version);
    });
  },
});
