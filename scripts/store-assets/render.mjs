// 스토어 이미지(스크린샷 1280×800, 작은 프로모 타일 440×280, 마키 1400×560)를 만든다.
// 사용법: npm run build && node scripts/store-assets/capture.mjs en && node scripts/store-assets/render.mjs en
import process from 'node:process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const lang = process.argv[2] ?? 'en';
const captures = join(root, 'out/store-assets/captures', lang);
const outDir = join(root, 'out/store-assets', lang);
const SIZES = { screenshot: [1280, 800], promo: [440, 280], marquee: [1400, 560] };

const copy = JSON.parse(await readFile(join(here, `slides.${lang}.json`), 'utf8'));
const shared = {
  lang,
  product: copy.product,
  url: copy.url,
  icon: pathToFileURL(join(root, 'public/icons/icon128.png')).href,
};

/** 캡처 파일 이름을 file:// 경로로 바꾼다 */
function resolveVisual(visual) {
  if (!visual || visual.type === 'timeline') return visual;
  return { ...visual, src: pathToFileURL(join(captures, visual.src)).href };
}

const assets = [
  ...copy.screenshots.map((shot) => ({ ...shot, kind: 'screenshot' })),
  { ...copy.promo, id: 'promo-small-440x280', kind: 'promo' },
  { ...copy.marquee, id: 'promo-marquee-1400x560', kind: 'marquee' },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const asset of assets) {
    const [width, height] = SIZES[asset.kind];
    // 스토어가 정확한 픽셀 크기를 요구하므로 1배율로 그린다
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const data = { ...shared, ...asset, visual: resolveVisual(asset.visual) };
    await page.addInitScript({ content: `window.__ASSET__ = ${JSON.stringify(data)};` });
    await page.goto(pathToFileURL(join(here, 'template.html')).href, { waitUntil: 'networkidle' });
    await page.evaluate('document.fonts.ready');

    // 글이 칸을 넘치면 잘린 이미지 대신 실패로 알린다
    const overflowing = await page
      .locator('[data-fit]')
      .evaluateAll((els) => els
        .filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.dataset.fit));
    if (overflowing.length > 0) throw new Error(`${asset.id}: 내용이 넘칩니다 — 문구를 줄이세요 (${overflowing.join(', ')})`);

    const out = join(outDir, `${asset.id}.png`);
    await page.locator('#frame').screenshot({ path: out });
    process.stdout.write(`${out}\n`);
    await page.close();
  }
} finally {
  await browser.close();
}
