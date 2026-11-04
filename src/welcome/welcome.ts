// src/welcome/welcome.ts
// 설치 직후 한 번 여는 감사·안내 페이지 (#121). 권한을 늘리지 않는다 — 열린 X 탭에 코드를 넣지 않고 새로고침만 권한다.
import { browser, type Browser } from 'wxt/browser';
import { findTabsNeedingReload, reloadTabs } from '@features/reload-notice';
import { applyTranslations, t, type Language } from '@shared/i18n';

type Tab = Browser.tabs.Tab;

const FOLLOWING_URL = 'https://x.com/following';
// 새로고침이 필요한 탭은 첫 확인이 실패하고 1초 뒤 다시 확인한다 — 그만큼만 기다리고 화면을 오래 비우지 않는다
const DETECT_TIMEOUT_MS = 1500;

export interface WelcomeOptions {
  language: Language;
  isFirefoxAndroid: boolean;
}

export function isFirefoxAndroidAgent(userAgent: string): boolean {
  return userAgent.includes('Firefox') && userAgent.includes('Android');
}

function withTimeout<T>(pending: Promise<T>, fallback: T, ms: number): Promise<T> {
  return Promise.race([pending, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** 확인이 실패하거나 시간 안에 끝나지 않으면 null — 탭이 없는 것과 구분한다 */
async function detectTabs(): Promise<Tab[] | null> {
  return withTimeout<Tab[] | null>(findTabsNeedingReload().catch(() => null), null, DETECT_TIMEOUT_MS);
}

/** 보이는 첫 단계에 신호 라인을 둔다 */
function markCurrentStep(doc: Document): void {
  const steps = Array.from(doc.querySelectorAll<HTMLElement>('.step'));
  const current = steps.find((step) => !step.hidden && !step.dataset['done']);
  steps.forEach((step) => step.classList.toggle('now', step === current));
}

function bindReload(doc: Document, lang: Language): void {
  const button = doc.getElementById('reload-tabs') as HTMLButtonElement;
  const step = doc.getElementById('step-reload') as HTMLElement;
  const status = doc.getElementById('reload-status') as HTMLElement;
  button.addEventListener('click', async () => {
    button.disabled = true;
    // 페이지를 연 뒤 사용자가 직접 새로고침했을 수 있다 — 누른 때 다시 찾아 그 탭만 새로고침한다
    const tabs = await detectTabs();
    if (!tabs) {
      // 확인하지 못했으면 완료로 표시하지 않고 다시 누를 수 있게 둔다
      button.disabled = false;
      return;
    }
    await reloadTabs(tabs);
    const done = t('welcomeReloadDone', lang);
    button.textContent = done;
    status.textContent = done;
    step.dataset['done'] = 'true';
    markCurrentStep(doc);
  });
}

function bindLinks(doc: Document): void {
  doc.getElementById('open-following')?.addEventListener('click', () => {
    void browser.tabs.create({ url: FOLLOWING_URL });
  });
}

/** 탭 확인과 번역을 마친 뒤 한 번에 보인다 — 단계 01이 늦게 끼어들어 화면이 밀리지 않게 */
export async function initWelcome(doc: Document, options: WelcomeOptions): Promise<void> {
  const { language, isFirefoxAndroid } = options;
  const tabs = (await detectTabs()) ?? [];

  const reloadStep = doc.getElementById('step-reload') as HTMLElement;
  reloadStep.hidden = tabs.length === 0;
  // Firefox Android에는 툴바 고정이 없다
  (doc.getElementById('step-pin') as HTMLElement).hidden = isFirefoxAndroid;

  applyTranslations(language, doc);
  (doc.getElementById('reload-tabs') as HTMLElement).textContent = t('welcomeReloadButton', language, { count: String(tabs.length) });
  markCurrentStep(doc);
  bindReload(doc, language);
  bindLinks(doc);
}
