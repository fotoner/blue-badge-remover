// src/welcome/index.ts — 환영 페이지 시작점 (#121)
import { getSettings } from '@features/settings';
import { initWelcome, isFirefoxAndroidAgent } from './welcome';

async function start(): Promise<void> {
  const { language } = await getSettings();
  await initWelcome(document, { language, isFirefoxAndroid: isFirefoxAndroidAgent(navigator.userAgent) });
}

void start();
