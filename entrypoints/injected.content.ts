// entrypoints/injected.content.ts — WXT MAIN world content script (fetch interceptor)
export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    // @ts-expect-error — fetch-interceptor는 side-effect 스크립트 (export 없음)
    import('../src/injected/fetch-interceptor');
  },
});
