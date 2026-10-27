// releases/<릴리스>.html을 시간별로 그려 MP4로 만든다 (1920×1080, 30fps). README.md 참고.
// 사용법: npm run demo-video -- v1.8.0                        → demo.mp4 + 장면별 반복 클립
//        npm run demo-video -- v1.8.0 --clip back-navigation → 그 클립만
//        npm run demo-video -- v1.8.0 --preview 3.2 4.0      → preview-<t>.png (--clip과 함께 쓰면 그 클립 기준)
import process from 'node:process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const FPS = 30;

function parseArgs(argv) {
  const [release, ...rest] = argv;
  if (!release) {
    process.stderr.write('사용법: npm run demo-video -- <릴리스> [--clip <장면>] [--preview <초> …]\n');
    process.exit(1);
  }
  const clip = rest.includes('--clip') ? rest[rest.indexOf('--clip') + 1] : null;
  const preview = rest.includes('--preview') ? rest.slice(rest.indexOf('--preview') + 1).filter((x) => !x.startsWith('--')).map(Number) : [];
  return { release, clip, preview };
}

async function open(browser, release, clip) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const url = pathToFileURL(resolve(here, 'releases', `${release}.html`));
  if (clip) url.search = `?clip=${clip}`;
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.evaluate('document.fonts.ready');
  return page;
}

async function renderVideo(page, file) {
  const frames = await mkdtemp(join(tmpdir(), 'bbr-demo-'));
  try {
    const total = Math.round((await page.evaluate('window.DURATION')) * FPS);
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => globalThis.render(t), i / FPS);
      await page.screenshot({ path: join(frames, `${String(i).padStart(5, '0')}.png`) });
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%05d.png'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);
    process.stdout.write(`${file} (${total} frames)\n`);
  } finally {
    await rm(frames, { recursive: true, force: true });
  }
}

const { release, clip, preview } = parseArgs(process.argv.slice(2));
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  process.stderr.write('ffmpeg가 필요합니다 (macOS: brew install ffmpeg)\n');
  process.exit(1);
}
const outDir = resolve('out/demo-video', release);
await mkdir(outDir, { recursive: true });

// 설치된 Chrome으로 그린다 (scripts/update-card, scripts/store-assets와 같음)
const browser = await chromium.launch({ channel: 'chrome' });
try {
  if (preview.length > 0) {
    const page = await open(browser, release, clip);
    for (const t of preview) {
      await page.evaluate((x) => globalThis.render(x), t);
      const file = join(outDir, `preview-${clip ? `${clip}-` : ''}${t}.png`);
      await page.screenshot({ path: file });
      process.stdout.write(`${file}\n`);
    }
  } else {
    const ids = await (await open(browser, release, null)).evaluate('window.SCENE_IDS');
    const targets = clip ? [clip] : [null, ...ids];
    for (const id of targets) {
      const page = await open(browser, release, id);
      const name = id ? `${String(ids.indexOf(id) + 1).padStart(2, '0')}-${id}.mp4` : 'demo.mp4';
      await renderVideo(page, join(outDir, name));
      await page.close();
    }
  }
} finally {
  await browser.close();
}
