// 빌드된 확장 화면(dist/chrome-mv3)을 chrome.* 스텁 위에 띄워 스토어 이미지용으로 캡처한다.
// 사용법: npm run build && node scripts/store-assets/capture.mjs [en|ko|ja]
// 예시 계정 아이디는 실존 계정과 겹칠 수 없는 16자 이상 sample_… (README 참고). 팔로우 목록은 개수만 보인다.
/* global document -- page.evaluate 콜백은 브라우저에서 실행된다 */
import process from 'node:process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dist = join(root, 'dist/chrome-mv3');
const lang = process.argv[2] ?? 'en';
const outDir = join(root, 'out/store-assets/captures', lang);
const ORIGIN = 'http://bbr.localhost';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
const seed = JSON.parse(await readFile(join(here, 'seed.json'), 'utf8'));
const UI_LANGUAGES = { en: 'en-US', ko: 'ko-KR', ja: 'ja-JP' };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 팔로우 목록은 개수만 보이므로 가상 아이디를 만들어 채운다
const store = {
  ...seed.storage,
  settings: { ...seed.storage.settings, language: lang },
  followList: Array.from({ length: seed.followCount }, (_, i) => `@follow_${i}`),
  lastSyncAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  [`stats-${today()}`]: { date: today(), totalShown: 0, byPack: {}, ...seed.today },
};

/** 페이지 안에서 실행 — chrome.storage / runtime / i18n / tabs 최소 스텁 */
function installStub({ store, version, uiLanguage }) {
  const listeners = [];
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  // chrome.storage.local.get 규칙: null=전체, 문자열/배열=있는 키만, 객체=없는 키는 기본값
  const pick = (keys) => {
    if (keys == null) return clone(store);
    const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const defaults = typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
    return Object.fromEntries(list
      .filter((k) => k in store || k in defaults)
      .map((k) => [k, clone(k in store ? store[k] : defaults[k])]));
  };
  const local = {
    get: async (keys) => pick(keys),
    set: async (items) => {
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: store[k], newValue: v };
        store[k] = v;
      }
      listeners.forEach((listener) => listener(changes, 'local'));
    },
    remove: async (keys) => { for (const k of [].concat(keys)) delete store[k]; },
  };
  const noopEvent = { addListener() {}, removeListener() {}, hasListener: () => false };
  const api = {
    runtime: {
      id: 'bbr-store-capture',
      getManifest: () => ({ name: 'Blue Badge Remover', version }),
      getURL: (path) => path,
      sendMessage: async (message) => (message?.type === 'BBR_WHITELIST' ? { whitelist: store.whitelist ?? [] } : undefined),
      onMessage: noopEvent,
      onInstalled: noopEvent,
    },
    storage: { local, onChanged: { addListener: (l) => listeners.push(l), removeListener() {}, hasListener: () => false } },
    i18n: { getUILanguage: () => uiLanguage, getMessage: (key) => key },
    tabs: { create: async () => ({}), query: async () => [], update: async () => ({}) },
  };
  globalThis.chrome = api;
  globalThis.browser = api;
}

// 스토어 갤러리에서 스크린샷은 절반 정도로 줄어 보이므로, 화면 전체 대신 핵심 부분만 잘라(clips) 크게 쓴다.
// clips: from 요소의 위부터 to 요소의 아래까지 (가로는 화면 전체, 위아래 여백 pad). 폭을 좁혀 찍을수록 같은 칸에서 더 크게 보인다.
const PAGES = [
  { name: 'popup', path: '/popup.html', width: 340, selector: '.container', clips: [
    { name: 'popup-top', from: '.header', to: '.stats-row', pad: 8 },
  ] },
  { name: 'dashboard', path: '/dashboard.html', width: 360, clips: [
    { name: 'dashboard-scope', from: '#section-filter-settings', to: 'label:has(#filter-lists)' },
  ] },
  { name: 'options', path: '/options.html', width: 360, clips: [
    { name: 'options-custom', from: 'section:has(#custom-filters)', to: 'section:has(#custom-filters)', pad: 12 },
  ] },
  { name: 'whitelist', path: '/whitelist.html', width: 360, clips: [
    { name: 'whitelist-list', from: '.add-row', to: '#whitelist-container' },
  ] },
];

const SECTION_MARGIN = 24;

/** 웹폰트를 못 받으면 시스템 글꼴로 조용히 찍히므로 실패로 알린다 (제목·본문 글꼴은 모든 화면에서 쓰임) */
async function assertFontsLoaded(page, families, label) {
  await page.evaluate('document.fonts.ready');
  const missing = await page.evaluate(
    (names) => {
      const faces = [...document.fonts];
      const failed = faces.filter((face) => face.status === 'error').map((face) => face.family);
      const notLoaded = names.filter((family) => !faces.some((face) => face.family.replace(/"/g, '') === family && face.status === 'loaded'));
      return [...new Set([...failed, ...notLoaded])];
    },
    families,
  );
  if (missing.length > 0) throw new Error(`${label}: 웹폰트를 불러오지 못했습니다 (${missing.join(', ')}) — 네트워크를 확인하세요`);
}

async function captureClip(page, { name, from, to, pad = SECTION_MARGIN }) {
  const first = await page.locator(from).first().boundingBox();
  const last = await page.locator(to).last().boundingBox();
  if (!first || !last) throw new Error(`${name}: ${from} / ${to} 구간을 찾지 못했습니다`);
  const top = Math.max(0, first.y - pad);
  const clip = { x: 0, y: top, width: page.viewportSize().width, height: last.y + last.height + pad - top };
  const out = join(outDir, `${name}.png`);
  await page.screenshot({ path: out, clip, fullPage: true });
  return out;
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const target of PAGES) {
    const page = await browser.newPage({ viewport: { width: target.width, height: 800 }, deviceScaleFactor: 3 });
    await page.route(`${ORIGIN}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      try {
        const body = await readFile(join(dist, path));
        await route.fulfill({ body, contentType: MIME[extname(path)] ?? 'application/octet-stream' });
      } catch {
        await route.fulfill({ status: 404 });
      }
    });
    await page.addInitScript(installStub, { store, version: manifest.version, uiLanguage: UI_LANGUAGES[lang] });
    await page.goto(`${ORIGIN}${target.path}`, { waitUntil: 'networkidle' });
    await assertFontsLoaded(page, ['Space Grotesk', 'IBM Plex Sans KR'], target.name);
    await page.waitForTimeout(300);
    const out = join(outDir, `${target.name}.png`);
    if (target.selector) await page.locator(target.selector).screenshot({ path: out });
    else await page.screenshot({ path: out, fullPage: true });
    process.stdout.write(`${out}\n`);
    for (const clip of target.clips ?? []) process.stdout.write(`${await captureClip(page, clip)}\n`);
    await page.close();
  }
} finally {
  await browser.close();
}
