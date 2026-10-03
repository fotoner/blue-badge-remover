// 빌드된 확장 화면(dist/chrome-mv3)을 chrome.* 스텁 위에 띄워 스토어 이미지용으로 캡처한다.
// 사용법: npm run build && node scripts/store-assets/capture.mjs [en|ko|ja]
// 예시 데이터의 계정 아이디는 모두 가상이다.
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
  const pick = (keys) => {
    if (keys == null) return clone(store);
    const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, clone(store[k])]));
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

// selector: 그 요소만 찍는다. sections: 옵션 페이지처럼 긴 화면에서 n번째~m번째 section 구간만 따로 찍는다
const PAGES = [
  { name: 'popup', path: '/popup.html', width: 340, selector: '.container' },
  { name: 'dashboard', path: '/dashboard.html', width: 500 },
  { name: 'options', path: '/options.html', width: 500, sections: { name: 'options-custom', from: 2, to: 3 } },
  { name: 'whitelist', path: '/whitelist.html', width: 500 },
];

const SECTION_MARGIN = 24;

async function captureSections(page, { name, from, to }) {
  const sections = page.locator('section');
  const first = await sections.nth(from).boundingBox();
  const last = await sections.nth(to).boundingBox();
  const top = Math.max(0, first.y - SECTION_MARGIN);
  const clip = { x: 0, y: top, width: page.viewportSize().width, height: last.y + last.height + SECTION_MARGIN - top };
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
    await page.evaluate('document.fonts.ready');
    await page.waitForTimeout(300);
    const out = join(outDir, `${target.name}.png`);
    if (target.selector) await page.locator(target.selector).screenshot({ path: out });
    else await page.screenshot({ path: out, fullPage: true });
    process.stdout.write(`${out}\n`);
    if (target.sections) process.stdout.write(`${await captureSections(page, target.sections)}\n`);
    await page.close();
  }
} finally {
  await browser.close();
}
