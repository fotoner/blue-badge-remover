// X 화면에서 DOM 조각을 떠서 테스트 픽스처(tests/fixtures/x-dom/*.html)로 쓸 수 있게 정리한다.
// 실행: aside repl "$(cat scripts/x-dom/capture-fixtures.js)"  (Aside 브라우저, x.com 로그인 필요)
// 출력: FIXTURE <name> <html> 줄. 공개 저장소용으로 핸들은 자리표시자, 본문·이미지는 제거한다.

const SANITIZE = (rootSelector, keepTextSelectors) => {
  const KEEP_ATTRS = ['data-testid', 'role', 'href', 'aria-label', 'tabindex', 'dir', 'viewBox', 'fill', 'datetime'];
  const DROP_SUBTREES = ['[data-testid="tweetPhoto"]', '[data-testid="videoPlayer"]', '[data-testid="card.wrapper"]', 'img', 'video'];
  const handles = new Map();
  const alias = (h) => {
    const key = h.toLowerCase();
    if (!handles.has(key)) handles.set(key, `user_${handles.size + 1}`);
    return handles.get(key);
  };
  const RESERVED = ['home', 'explore', 'search', 'notifications', 'messages', 'i', 'settings', 'compose', 'hashtag'];
  const fixHandle = (value) => value
    .replace(/^\/([A-Za-z0-9_]{1,15})(?=\/|$)/, (m, h) => (RESERVED.includes(h.toLowerCase()) ? m : `/${alias(h)}`))
    .replace(/@([A-Za-z0-9_]{1,15})/g, (_, h) => `@${alias(h)}`)
    .replace(/UserAvatar-Container-([A-Za-z0-9_]{1,15})/, (_, h) => `UserAvatar-Container-${alias(h)}`)
    .replace(/\/status\/\d+/, '/status/1');
  const src = document.querySelector(rootSelector);
  if (!src) return null;
  const root = src.cloneNode(true);
  for (const sel of DROP_SUBTREES) root.querySelectorAll(sel).forEach((n) => n.replaceWith(document.createElement('div')));
  const keepText = new Set();
  for (const sel of keepTextSelectors) root.querySelectorAll(sel).forEach((n) => keepText.add(n));
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const kept = Array.from(keepText).find((k) => k.contains(child));
        const text = child.textContent;
        if (!kept) child.textContent = (text.trim() && !['인용', 'Quote'].includes(text.trim())) ? '…' : text;
        else if (kept.matches('[data-testid="socialContext"]')) {
          // 머리글은 "<이름 span> 님이 재게시함" 처럼 이름과 문구가 나뉜다 — 문구만 남기고 이름은 자리표시자로
          const m = text.match(/^(.*?)(\s*님이\s*재게시함|\s+reposted)$/);
          child.textContent = m ? (m[1].trim() ? '표시 이름' : '') + m[2] : (text.trim() ? '표시 이름' : text);
        }
        else if (kept.matches('[data-testid="User-Name"]') && text.trim() && !/^[@·]/.test(text.trim())) child.textContent = '표시 이름';
        else child.textContent = fixHandle(text);
      } else if (child.nodeType === 1) {
        for (const attr of Array.from(child.attributes)) {
          // aria-label에는 표시 이름이 들어갈 수 있다 — UI 문구만 있는 요소(내비게이션·계정 버튼·배지)에만 남긴다
          const keepAria = attr.name !== 'aria-label' || child.matches('nav, [data-testid^="AppTabBar_"], [data-testid^="SideNav_"], [data-testid="icon-verified"]');
          if (!KEEP_ATTRS.includes(attr.name) || !keepAria) child.removeAttribute(attr.name);
          else child.setAttribute(attr.name, fixHandle(attr.value));
        }
        if (child.tagName.toLowerCase() === 'path') child.setAttribute('d', 'M0 0');
        walk(child);
      }
    }
  };
  for (const attr of Array.from(root.attributes)) if (!KEEP_ATTRS.includes(attr.name)) root.removeAttribute(attr.name);
  walk(root);
  return root.outerHTML.replace(/<div><\/div>/g, '').replace(/\s{2,}/g, ' ');
};

const LABEL_SELECTORS = ['[data-testid="User-Name"]', '[data-testid="socialContext"]'];

async function captureFrom(url, pick) {
  const tab = await openTab(url);
  await sleep(4500);
  let html = null;
  for (let i = 0; i < 15 && !html; i++) {
    html = await tab.evaluate(`(${pick})(${SANITIZE.toString()}, ${JSON.stringify(LABEL_SELECTORS)})`);
    if (!html) { await tab.evaluate(() => window.scrollBy(0, 1500)); await sleep(1000); }
  }
  await closeTab(tab);
  return html;
}

const PICKERS = {
  'account-switcher': ['https://x.com/home', (S) => {
    const nav = document.querySelector('header nav[role="navigation"]');
    if (!nav) return null;
    nav.setAttribute('data-bbr-capture', '1');
    const out = S('[data-bbr-capture="1"]', []);
    nav.removeAttribute('data-bbr-capture');
    const btn = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    btn.setAttribute('data-bbr-capture', '2');
    const sw = S('[data-bbr-capture="2"]', []);
    btn.removeAttribute('data-bbr-capture');
    return `<header role="banner">${out}${sw}</header>`;
  }],
  'repost-wrapped-social-context': ['https://x.com/search?q=' + encodeURIComponent('from:elonmusk filter:nativeretweets include:nativeretweets') + '&f=live', (S, keep) => {
    // 조건: 링크가 socialContext를 감싼 리트윗 + 작성자는 파딱(path 1개·fill·gradient 없음) + 인용 카드는 금색·회색 배지(gradient)
    const a = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).find((x) => {
      const card = Array.from(x.querySelectorAll('div[role="link"]')).find((d) => d.querySelector('[data-testid="User-Name"]'));
      const authorName = Array.from(x.querySelectorAll('[data-testid="User-Name"]')).find((u) => !card?.contains(u));
      const authorBadge = authorName?.querySelector('[data-testid="icon-verified"]');
      const authorSvg = authorBadge ? (authorBadge.closest('svg') || authorBadge) : null;
      const authorIsBlue = !!authorSvg && !authorSvg.querySelector('linearGradient')
        && authorSvg.querySelectorAll('path').length === 1 && !authorSvg.querySelector('path').getAttribute('fill');
      return x.querySelector('[data-testid="socialContext"]')?.closest('a') && authorIsBlue
        && card?.querySelector('[data-testid="icon-verified"] linearGradient');
    });
    if (!a) return null;
    a.setAttribute('data-bbr-capture', '3');
    const out = S('[data-bbr-capture="3"]', keep);
    a.removeAttribute('data-bbr-capture');
    return out;
  }],
  'quote-card': ['https://x.com/search?q=' + encodeURIComponent('filter:quote -filter:blue_verified') + '&f=live', (S, keep) => {
    // 조건(#35 상황): 작성자는 배지 없음 + 인용 카드는 파딱 배지(gradient 없음)
    const a = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).find((x) => {
      const card = Array.from(x.querySelectorAll('div[role="link"]')).find((d) => d.querySelector('[data-testid="User-Name"]'));
      const authorName = Array.from(x.querySelectorAll('[data-testid="User-Name"]')).find((u) => !card?.contains(u));
      const quoteBadge = card?.querySelector('[data-testid="icon-verified"]');
      return card && authorName && !authorName.querySelector('[data-testid="icon-verified"]') && quoteBadge && !quoteBadge.querySelector('linearGradient');
    });
    if (!a) return null;
    a.setAttribute('data-bbr-capture', '4');
    const out = S('[data-bbr-capture="4"]', keep);
    a.removeAttribute('data-bbr-capture');
    return out;
  }],
};

for (const [name, [url, pick]] of Object.entries(PICKERS)) {
  const html = await captureFrom(url, pick.toString());
  console.log(`FIXTURE ${name} ${html ?? 'NOT_FOUND'}`);
}
