#!/usr/bin/env node
// 설치 직후 이미 열린 X 탭 확인 (스킬 browser-qa, #121).
// 임시 프로필 Chromium에서 x.com을 먼저 열고, 그 뒤 확장을 새로 설치해(onInstalled install) 토스트를 확인한다.
// 사용자 프로필을 쓰지 않는다(AGENTS.md SAFE-1). 로그아웃 상태의 x.com만 연다.
// 사용: node scripts/qa/install-check.mjs <확장 폴더(dist/chrome-mv3)> [언어=ko] [light|dark=dark]
//   실행 파일은 CHROMIUM 환경 변수, 없으면 Playwright의 Chromium(`npx playwright install chromium`)
// 종료 코드: 0 토스트 확인·새로고침 뒤 사라짐, 1 실패, 2 사용법 오류
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

const TOAST = `(() => {
  const box = document.getElementById('bbr-reload-toast')?.shadowRoot?.querySelector('[role=status]');
  return box ? JSON.stringify({ text: box.querySelector('span').textContent, theme: box.dataset.theme,
    buttons: [...box.querySelectorAll('button')].map((b) => b.textContent) }) : null;
})()`;
const MAIN_START = `document.documentElement.getAttribute('data-bbr-main-ready-state')`;

let code = 1;
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, sessionId);
  await send('Page.navigate', { url: 'https://x.com/' }, sessionId);
  await sleep(10000);
  console.log('x.com 열림:', await evaluate(sessionId, 'location.href + " " + document.readyState'));
  console.log('설치:', (await send('Extensions.loadUnpacked', { path: extPath })).id);
  await sleep(6000);
  const toast = await evaluate(sessionId, TOAST);
  console.log('토스트:', toast);
  const shot = join(tmpdir(), `bbr-install-${lang}-${scheme}.png`);
  writeFileSync(shot, Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, sessionId)).data, 'base64'));
  console.log('캡처:', shot);
  if (toast) {
    await evaluate(sessionId, `document.getElementById('bbr-reload-toast').shadowRoot.querySelector('.reload').click(); true`);
    await sleep(10000);
    const gone = !(await evaluate(sessionId, `!!document.getElementById('bbr-reload-toast')`));
    const start = await evaluate(sessionId, MAIN_START);
    console.log('새로고침 뒤: 토스트 사라짐', gone, '· MAIN world 시작', start);
    code = gone && start === 'loading' ? 0 : 1;
  }
} catch (error) {
  console.error('실패:', error.message);
} finally {
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(code);
