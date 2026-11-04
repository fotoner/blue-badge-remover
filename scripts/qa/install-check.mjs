#!/usr/bin/env node
// 설치 직후 이미 열린 X 탭 확인 (스킬 browser-qa, #121).
// 임시 프로필 Chromium에서 x.com을 먼저 열고, 그 뒤 확장을 새로 설치해(onInstalled install) 환영 페이지가 열리는지,
// 그 페이지의 새로고침 버튼이 열려 있던 X 탭을 새로고침해 확장이 동작하게 하는지 확인한다.
// 사용자 프로필을 쓰지 않는다(AGENTS.md SAFE-1). 로그아웃 상태의 x.com만 연다.
// 사용: node scripts/qa/install-check.mjs <확장 폴더(dist/chrome-mv3)> [언어=ko] [light|dark=dark]
//   실행 파일은 CHROMIUM 환경 변수, 없으면 Playwright의 Chromium(`npx playwright install chromium`)
// 종료 코드: 0 환영 페이지에 X 탭 1개 새로고침 안내 → 누른 뒤 그 탭에서 확장 시작, 1 실패, 2 사용법 오류
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [extArg, lang = 'ko', scheme = 'dark'] = process.argv.slice(2);
if (!extArg || !['light', 'dark'].includes(scheme)) {
  console.error('사용: node scripts/qa/install-check.mjs <확장 폴더> [언어] [light|dark]');
  process.exit(2);
}
const extPath = resolve(extArg);
const exe = process.env.CHROMIUM ?? createRequire(import.meta.url)('playwright').chromium.executablePath();
if (!existsSync(exe)) {
  console.error(`Chromium이 없습니다: ${exe}\nnpx playwright install chromium 을 먼저 실행하거나 CHROMIUM에 실행 파일 경로를 주세요`);
  process.exit(2);
}

// X는 HeadlessChrome 사용자 에이전트에 403을 준다. macOS는 --lang 대신 -AppleLanguages로 UI 언어를 정한다
const profile = mkdtempSync(join(tmpdir(), 'bbr-install-check-'));
const browser = spawn(exe, [
  '--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,800',
  '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  `--lang=${lang}`, '-AppleLanguages', `(${lang})`,
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

const pending = new Map();
let nextId = 0;
let buffer = '';
browser.stdio[4].on('data', (chunk) => {
  buffer += chunk;
  for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    const waiter = pending.get(message.id);
    if (!waiter) continue;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  }
});
browser.on('exit', () => { for (const waiter of pending.values()) waiter.reject(new Error('브라우저가 종료됐습니다')); });

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  browser.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  return new Promise((ok, fail) => pending.set(id, { resolve: ok, reject: fail }));
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function evaluate(sessionId, expression) {
  const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  return result.value;
}

const WELCOME = `JSON.stringify({
  lang: document.documentElement.lang,
  ready: document.documentElement.dataset.i18nReady ?? null,
  reloadHidden: document.getElementById('step-reload').hidden,
  button: document.getElementById('reload-tabs').textContent,
  disabled: document.getElementById('reload-tabs').disabled,
  now: document.querySelector('.step.now')?.id ?? null,
  steps: [...document.querySelectorAll('.step')].filter((step) => !step.hidden).map((step) => step.id),
})`;
const MAIN_START = `document.documentElement.getAttribute('data-bbr-main-ready-state')`;

async function screenshot(sessionId, name) {
  const shot = join(tmpdir(), `bbr-welcome-${lang}-${scheme}-${name}.png`);
  writeFileSync(shot, Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId)).data, 'base64'));
  console.log('캡처:', shot);
}

async function attachWelcome() {
  for (let tries = 0; tries < 20; tries += 1) {
    const { targetInfos } = await send('Target.getTargets');
    const target = targetInfos.find((info) => info.type === 'page' && info.url.endsWith('/welcome.html'));
    if (target) return (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    await sleep(500);
  }
  return null;
}

let code = 1;
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: xTab } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.navigate', { url: 'https://x.com/' }, xTab);
  await sleep(10000);
  console.log('x.com 열림:', await evaluate(xTab, 'location.href + " " + document.readyState'));
  console.log('설치:', (await send('Extensions.loadUnpacked', { path: extPath })).id);
  const welcome = await attachWelcome();
  if (!welcome) throw new Error('환영 페이지가 열리지 않았습니다');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, welcome);
  await sleep(4000);
  const before = JSON.parse(await evaluate(welcome, WELCOME));
  console.log('환영 페이지:', JSON.stringify(before));
  await screenshot(welcome, 'desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, welcome);
  await sleep(500);
  await screenshot(welcome, 'mobile');
  await send('Emulation.clearDeviceMetricsOverride', {}, welcome);
  if (!before.reloadHidden) {
    await evaluate(welcome, `document.getElementById('reload-tabs').click(); true`);
    await sleep(10000);
    const after = JSON.parse(await evaluate(welcome, WELCOME));
    const start = await evaluate(xTab, MAIN_START);
    console.log('새로고침 뒤:', JSON.stringify(after), '· X 탭 MAIN world 시작', start);
    await screenshot(welcome, 'after-reload');
    code = before.ready === 'true' && after.disabled && after.now === 'step-follow' && start === 'loading' ? 0 : 1;
  }
} catch (error) {
  console.error('실패:', error.message);
} finally {
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(code);
