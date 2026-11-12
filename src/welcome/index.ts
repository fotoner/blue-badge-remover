// src/welcome/index.ts — 환영 페이지 시작점 (#121)
import { getSettings } from '@features/settings';
import { DEFAULT_LANGUAGE } from '@shared/i18n';
import { initWelcome, isFirefoxAndroidAgent } from './welcome';

async function start(): Promise<void> {
  // 설정을 읽지 못해도 기본 언어로 그리고 버튼을 연결한다
  const { language } = await getSettings().catch(() => ({ language: DEFAULT_LANGUAGE }));
  await initWelcome(document, { language, isFirefoxAndroid: isFirefoxAndroidAgent(navigator.userAgent) });
}

void start();
