// 뒤로가기 직후 숨김 품질을 한 번 측정한다 (#72·#73·#74).
// 실행: aside repl "$(cat scripts/x-dom/back-nav-measure.js)"   — 여러 번 반복해 비율을 본다.
// 시나리오: 홈을 2500px까지 조금씩 내림 → 보이는 트윗 상세로 이동 → 뒤로가기 → 3.5초 관찰.
// 출력: BACKNAV {"flash": 숨기기 전에 그려진 파딱 수, "anchorShift": 클릭 전 맨 위 트윗의 위치 변화(px)}

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
  const isBlue = (a) => {
    const b = a.querySelector('[data-testid="User-Name"] [data-testid="icon-verified"]');
    if (!b) return false;
    const svg = b.closest('svg') || b;
    const paths = svg.querySelectorAll('path');
    return !svg.querySelector('linearGradient') && paths.length === 1 && !paths[0].getAttribute('fill');
  };
  const S = { frames: 0, firstVisible: new Map(), hiddenFrame: new Map(), blankPx: 0 };
  window.__bbrMeasure = S;
  const loop = () => {
    S.frames++;
    for (const a of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (!isBlue(a)) continue;
      const hidden = a.hasAttribute('data-bbr-original');
      const r = a.getBoundingClientRect();
      const inView = r.height > 2 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(a).visibility !== 'hidden';
      if (inView && !hidden && !S.firstVisible.has(a)) S.firstVisible.set(a, S.frames);
    }
    if (S.frames < 220) requestAnimationFrame(loop);
  };
  // 숨김 시점은 속성이 바뀐 순간의 프레임으로 기록한다. 다음 샘플에서 읽으면 같은 프레임에 그리기 전 숨긴 것도 "보였다"로 센다.
  new MutationObserver((muts) => {
    for (const m of muts) if (m.target.hasAttribute('data-bbr-original') && !S.hiddenFrame.has(m.target)) S.hiddenFrame.set(m.target, S.frames);
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-bbr-original'] });
  requestAnimationFrame(loop);
  history.back();
});
await sleep(3500);

const out = await tab.evaluate(() => {
  const S = window.__bbrMeasure;
  let flash = 0;
  for (const [a, f] of S.firstVisible) { const h = S.hiddenFrame.get(a); if (h !== undefined && f < h) flash++; }
  const anchor = Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
    .find((x) => x.querySelector('time')?.closest('a')?.getAttribute('href') === window.__bbrAnchor);
  return { flash, anchorTop: anchor ? Math.round(anchor.getBoundingClientRect().top) : null };
});
await closeTab(tab);
console.log('BACKNAV ' + JSON.stringify({ flash: out.flash, anchorShift: out.anchorTop === null ? null : out.anchorTop - before.top }));
