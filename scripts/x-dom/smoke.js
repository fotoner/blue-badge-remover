// 확장이 의존하는 X 화면 구조가 그대로인지 실브라우저에서 점검한다 (X가 DOM을 바꿨는지 빨리 알아채기 위함).
// 실행: aside repl "$(cat scripts/x-dom/smoke.js)"   (Aside 브라우저, x.com 로그인 필요)
// 출력: PASS/FAIL/SKIP <항목> <세부> 줄 (SKIP은 표본이 없어 확인하지 못함). FAIL이 나오면 해당 셀렉터를 쓰는 코드와 tests/fixtures/x-dom을 갱신한다.

const results = [];
const check = (name, ok, detail, skipped = false) => results.push(`${skipped ? 'SKIP' : ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);

const home = await openTab('https://x.com/home');
await sleep(4500);
for (let i = 0; i < 3; i++) { await home.evaluate(() => window.scrollBy(0, 1500)); await sleep(1000); }

const dom = await home.evaluate(() => {
  const isBlue = (badge) => {
    const svg = badge.closest('svg') || badge;
    const paths = svg.querySelectorAll('path');
    return !svg.querySelector('linearGradient') && paths.length === 1 && !paths[0].getAttribute('fill');
  };
  const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const quoteArticles = tweets.filter((a) => Array.from(a.querySelectorAll('div[role="link"]')).some((d) => d.querySelector('[data-testid="User-Name"]')));
  const quoteLabelAgrees = quoteArticles.filter((a) => {
    const label = Array.from(a.querySelectorAll('div,span')).find((e) => e.childNodes.length === 1 && ['인용', 'Quote'].includes((e.textContent || '').trim()));
    const card = Array.from(a.querySelectorAll('div[role="link"]')).find((d) => d.querySelector('[data-testid="User-Name"]'));
    // 라벨 폴백(findQuoteBlock)도 쓸 수 있어야 한다 — 라벨이 없거나 카드의 앞 형제가 아니면 불일치
    return !!label && label.nextElementSibling === card;
  });
  return {
    profileLink: !!document.querySelector('a[data-testid="AppTabBar_Profile_Link"]'),
    switcherAvatar: document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="UserAvatar-Container-"]') !== null,
    tweets: tweets.length,
    withUserName: tweets.filter((a) => a.querySelector('[data-testid="User-Name"]')).length,
    withStatusTime: tweets.filter((a) => a.querySelector('time')?.closest('a')?.getAttribute('href')?.includes('/status/')).length,
    blueBadges: tweets.filter((a) => { const b = a.querySelector('[data-testid="User-Name"] [data-testid="icon-verified"]'); return b && isBlue(b); }).length,
    quotes: quoteArticles.length,
    quoteLabelAgrees: quoteLabelAgrees.length,
    hasMain: !!document.querySelector('main'),
    hasNavigationApi: typeof window.navigation !== 'undefined',
  };
});
check('account-handle', dom.profileLink || dom.switcherAvatar, { profileLink: dom.profileLink, switcherAvatar: dom.switcherAvatar });
check('tweet-articles', dom.tweets > 0 && dom.withUserName === dom.tweets, { tweets: dom.tweets, withUserName: dom.withUserName });
check('status-time-link', dom.withStatusTime >= dom.tweets * 0.8, { withStatusTime: dom.withStatusTime, tweets: dom.tweets });
// 트윗이 적게 로드되면 파딱이 없을 수도 있다 — 표본이 작고 0건이면 확인 못 함(SKIP)
check('blue-badge-svg', dom.blueBadges > 0, { blueBadges: dom.blueBadges, tweets: dom.tweets }, dom.blueBadges === 0 && dom.tweets < 10);
check('quote-card', dom.quoteLabelAgrees === dom.quotes, { quotes: dom.quotes, labelAgrees: dom.quoteLabelAgrees }, dom.quotes === 0);
check('navigation-api', dom.hasNavigationApi, {});

const spa = await home.evaluate(async () => {
  const main = document.querySelector('main');
  let navEvents = 0;
  window.navigation?.addEventListener('currententrychange', () => { navEvents++; });
  const link = document.querySelector('article[data-testid="tweet"] time')?.closest('a');
  if (!link) return { skipped: true };
  link.click();
  await new Promise((r) => setTimeout(r, 2000));
  history.back();
  await new Promise((r) => setTimeout(r, 2000));
  return { sameMain: document.querySelector('main') === main, navEvents };
});
check('spa-main-kept', !!spa.sameMain, spa, !!spa.skipped);
check('spa-navigation-event', spa.navEvents >= 2, spa, !!spa.skipped);
await closeTab(home);

const search = await openTab('https://x.com/search?q=' + encodeURIComponent('from:elonmusk filter:nativeretweets include:nativeretweets') + '&f=live');
await sleep(5000);
const repost = await search.evaluate(() => {
  const sc = document.querySelector('article[data-testid="tweet"] [data-testid="socialContext"]');
  if (!sc) return { found: false };
  return { found: true, wrappedByLink: !!sc.closest('a[href^="/"]'), innerLink: !!sc.querySelector('a[href^="/"]') };
});
check('repost-header-link', repost.found && (repost.wrappedByLink || repost.innerLink), repost);
await closeTab(search);

console.log(results.join('\n'));
