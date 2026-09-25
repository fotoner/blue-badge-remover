// 업데이트 안내 카드(X 게시용 1600×900 PNG)를 만든다.
// 사용법: npm run card -- scripts/update-card/cards/v1.6.2.json [출력.png]
import process from 'node:process';
import { mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const WIDTH = 1600;
const HEIGHT = 900;
const here = dirname(fileURLToPath(import.meta.url));

const [input, output] = process.argv.slice(2);
if (!input) {
  process.stderr.write('사용법: npm run card -- <카드.json> [출력.png]\n');
  process.exit(1);
}

const card = JSON.parse(await readFile(input, 'utf8'));
const out = resolve(output ?? `out/update-card/${basename(input, '.json')}.png`);
await mkdir(dirname(out), { recursive: true });

// 설치된 Chrome으로 그린다 (Playwright 브라우저를 따로 받지 않아도 됨)
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
  await page.addInitScript({ content: `window.__CARD__ = ${JSON.stringify(card)};` });
  await page.goto(pathToFileURL(resolve(here, 'template.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate('document.fonts.ready');

  // 글이 길어 카드나 항목 칸을 넘치면 잘린 이미지 대신 실패로 알린다
  const overflowing = await page
    .locator('[data-fit]')
    .evaluateAll((els) => els.filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.dataset.fit));
  if (overflowing.length > 0) {
    throw new Error(`내용이 넘칩니다 — 문구를 줄이세요: ${overflowing.join(', ')}`);
  }

  await page.locator('.card').screenshot({ path: out });
  process.stdout.write(`${out}\n`);
} finally {
  await browser.close();
}
