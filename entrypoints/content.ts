// entrypoints/content.ts — WXT content script (ISOLATED world)
export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_idle',
  main() {
    // 실제 로직은 src/content/에 위치. 여기서 import하여 초기화.
    import('../src/content/index');
  },
});
