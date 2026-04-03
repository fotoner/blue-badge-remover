// entrypoints/injected.content.ts — WXT MAIN world content script (fetch interceptor)
export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    import('../src/injected/fetch-interceptor');
  },
});
