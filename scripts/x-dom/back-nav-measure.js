// 뒤로가기 직후 숨김 품질을 한 번 측정한다 (#72·#73·#74).
// 실행: aside repl "$(cat scripts/x-dom/back-nav-measure.js)"   — 여러 번 반복해 비율을 본다.
// 시나리오: 홈을 2500px까지 조금씩 내림 → 보이는 트윗 상세로 이동 → 뒤로가기 → 3.5초 관찰.
// 출력: BACKNAV {"flash": 그려진 뒤에 숨겨진 파딱 수, "anchorShift": 클릭 전 맨 위 트윗의 위치 변화(px)}
// "그려짐"은 브라우저의 Element Timing 기록으로 판정한다. 트윗이 DOM에 들어오는 순간(그리기 전) 본문·이름에
// elementtiming 속성을 달면, 실제로 화면에 그려졌을 때만 기록이 남는다. 프레임 번호 비교로는 그리기 전/후를 구분할 수 없다.

const tab = await openTab('https://x.com/home');
await sleep(4500);
for (let y = 250; y <= 2500; y += 250) { await tab.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(120); }
await sleep(2000);

const before = await tab.evaluate(() => {
  const key = (a) => a.querySelector('time')?.closest('a')?.getAttribute('href') || null;
  const a = Array.from(document.querySelectorAll('article[data-testid="tweet"]:not([data-bbr-original])'))
    .find((x) => { const r = x.getBoundingClientRect(); return r.height > 2 && r.top >= 50 && key(x); });
  if (!a) return null;
  window.__bbrAnchor = key(a);
  a.querySelector('time').closest('a').click();
  return { top: Math.round(a.getBoundingClientRect().top) };
});
if (!before) throw new Error('no visible tweet to open');
await sleep(2500);

await tab.evaluate(() => {
  const S = { painted: new Map(), hiddenAt: new Map(), ids: new WeakMap(), next: 0 };
  window.__bbrMeasure = S;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!S.painted.has(e.identifier)) S.painted.set(e.identifier, e.renderTime || e.loadTime);
  }).observe({ type: 'element' });
  const idOf = (a) => { if (!S.ids.has(a)) S.ids.set(a, `bbr-${++S.next}`); return S.ids.get(a); };
  // 배지가 늦게 붙어도 놓치지 않게 모든 트윗에 단다 — 셀 때는 숨겨진 트윗만 본다
  const mark = (a) => {
    a.querySelectorAll('[data-testid="tweetText"], [data-testid="tweetText"] *, [data-testid="User-Name"] span').forEach((el) => el.setAttribute('elementtiming', idOf(a)));
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') {
        if (m.target.hasAttribute('data-bbr-original') && !S.hiddenAt.has(m.target)) S.hiddenAt.set(m.target, performance.now());
        continue;
      }
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const own = node.closest('article[data-testid="tweet"]');
        if (own) mark(own);
        node.querySelectorAll('article[data-testid="tweet"]').forEach(mark);
      }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-bbr-original'] });
  history.back();
});
await sleep(3500);

const out = await tab.evaluate(() => {
  const S = window.__bbrMeasure;
  let flash = 0;
  for (const [a, hiddenAt] of S.hiddenAt) {
    const paintedAt = S.ids.has(a) ? S.painted.get(S.ids.get(a)) : undefined;
    if (paintedAt !== undefined && paintedAt < hiddenAt) flash++;
  }
  const anchor = Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
    .find((x) => x.querySelector('time')?.closest('a')?.getAttribute('href') === window.__bbrAnchor);
  return { flash, anchorTop: anchor ? Math.round(anchor.getBoundingClientRect().top) : null };
});
await closeTab(tab);
console.log('BACKNAV ' + JSON.stringify({ flash: out.flash, anchorShift: out.anchorTop === null ? null : out.anchorTop - before.top }));
