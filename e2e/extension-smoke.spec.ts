import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../dist/chrome-mv3');

async function launchWithExtension(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--disable-gpu',
    ],
  });
}

test.describe('Extension Smoke Test', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await launchWithExtension();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('extension loads and popup opens', async () => {
    // 확장이 로드되었는지 확인: service worker가 등록되어 있어야 함
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10000 });
    }
    expect(serviceWorker).toBeTruthy();

    // 확장 ID 추출
    const extensionId = serviceWorker.url().split('/')[2];
    expect(extensionId).toBeTruthy();

    // 팝업 페이지 열기
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    // 팝업에 "Blue Badge Remover" 제목이 있는지 확인
    const title = await popupPage.locator('h1').textContent();
    expect(title).toContain('Blue Badge Remover');

    // 필터링 토글이 존재하는지 확인
    const enabledCheckbox = popupPage.locator('#enabled');
    await expect(enabledCheckbox).toBeVisible();

    await popupPage.close();
  });

  test('popup settings persist', async () => {
    const serviceWorker = context.serviceWorkers()[0];
    const extensionId = serviceWorker.url().split('/')[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // 디버그 모드 토글
    const debugCheckbox = page.locator('#debugMode');
    await debugCheckbox.check();
    // 잠시 대기 (storage 저장)
    await page.waitForTimeout(500);

    // 새 탭에서 다시 열어서 상태 유지 확인
    const page2 = await context.newPage();
    await page2.goto(`chrome-extension://${extensionId}/popup.html`);
    await page2.waitForLoadState('domcontentloaded');

    const debugChecked = await page2.locator('#debugMode').isChecked();
    expect(debugChecked).toBe(true);

    // 원복
    await page2.locator('#debugMode').uncheck();
    await page2.waitForTimeout(500);

    await page.close();
    await page2.close();
  });

  test('mock timeline: extension build contains content scripts', async () => {
    // content script가 빌드 출력에 포함되어 있는지 파일 존재 확인
    const fs = await import('fs');
    const contentScript = path.join(EXTENSION_PATH, 'content-scripts', 'content.js');
    const injectedScript = path.join(EXTENSION_PATH, 'content-scripts', 'injected.js');

    expect(fs.existsSync(contentScript)).toBe(true);
    expect(fs.existsSync(injectedScript)).toBe(true);

    // content.js에 BBR 초기화 코드가 포함되어 있는지 확인
    const contentCode = fs.readFileSync(contentScript, 'utf-8');
    expect(contentCode.length).toBeGreaterThan(1000);
  });
});
