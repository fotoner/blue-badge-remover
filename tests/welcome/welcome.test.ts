import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@shared/i18n';

const mocks = vi.hoisted(() => ({
  findTabsNeedingReload: vi.fn(),
  reloadTabs: vi.fn(),
  create: vi.fn(),
}));

vi.mock('wxt/browser', () => ({ browser: { tabs: { create: mocks.create } } }));
vi.mock('@features/reload-notice', () => ({
  findTabsNeedingReload: mocks.findTabsNeedingReload,
  reloadTabs: mocks.reloadTabs,
}));

const { initWelcome, isFirefoxAndroidAgent } = await import('../../src/welcome/welcome');

const DESKTOP = { language: 'ko', isFirefoxAndroid: false } as const;

function loadPage(): void {
  const html = readFileSync(resolve(process.cwd(), 'entrypoints/welcome/index.html'), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;
  delete document.documentElement.dataset['i18nReady'];
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function currentStepId(): string | undefined {
  return document.querySelector<HTMLElement>('.step.now')?.id;
}

beforeEach(() => {
  vi.useRealTimers();
  [mocks.findTabsNeedingReload, mocks.reloadTabs, mocks.create].forEach((mock) => mock.mockReset());
  mocks.findTabsNeedingReload.mockResolvedValue([]);
  mocks.reloadTabs.mockResolvedValue(0);
  loadPage();
});

describe('환영 페이지 단계', () => {
  it('새로고침할 X 탭이 없으면 단계 01을 숨기고 팔로우 단계가 지금 할 단계다', async () => {
    await initWelcome(document, DESKTOP);

    expect(el('step-reload').hidden).toBe(true);
    expect(currentStepId()).toBe('step-follow');
    expect(document.documentElement.dataset['i18nReady']).toBe('true');
  });

  it('새로고침할 X 탭이 있으면 단계 01에 탭 수를 보인다', async () => {
    mocks.findTabsNeedingReload.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    await initWelcome(document, DESKTOP);

    expect(el('step-reload').hidden).toBe(false);
    expect(el('reload-tabs').textContent).toBe(t('welcomeReloadButton', 'ko', { count: '2' }));
    expect(currentStepId()).toBe('step-reload');
  });

  it('탭 확인이 끝나지 않아도 1.5초 뒤에는 단계 01 없이 그린다', async () => {
    vi.useFakeTimers();
    mocks.findTabsNeedingReload.mockReturnValue(new Promise(() => {}));
    const pending = initWelcome(document, DESKTOP);
    await vi.advanceTimersByTimeAsync(1500);
    await pending;

    expect(el('step-reload').hidden).toBe(true);
    expect(document.documentElement.dataset['i18nReady']).toBe('true');
  });

  it('Firefox Android에는 툴바 고정이 없어 아이콘 고정 단계를 숨긴다', async () => {
    await initWelcome(document, { language: 'ko', isFirefoxAndroid: true });

    expect(el('step-pin').hidden).toBe(true);
  });
});

describe('새로고침 버튼', () => {
  it('누른 때 다시 찾은 탭만 새로고침하고, 버튼을 끈 채 완료를 알린다', async () => {
    mocks.findTabsNeedingReload.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]).mockResolvedValueOnce([{ id: 2 }]);
    await initWelcome(document, DESKTOP);

    el('reload-tabs').click();
    await vi.waitFor(() => expect(el<HTMLButtonElement>('reload-tabs').textContent).toBe(t('welcomeReloadDone', 'ko')));

    expect(mocks.reloadTabs).toHaveBeenCalledWith([{ id: 2 }]);
    expect(el<HTMLButtonElement>('reload-tabs').disabled).toBe(true);
    expect(el('reload-status').textContent).toBe(t('welcomeReloadDone', 'ko'));
    expect(currentStepId()).toBe('step-follow');
  });
});

describe('새로고침 버튼 — 확인 실패', () => {
  it('누른 때 탭을 확인하지 못하면 완료로 표시하지 않고 다시 누를 수 있게 둔다', async () => {
    mocks.findTabsNeedingReload.mockResolvedValueOnce([{ id: 1 }]).mockRejectedValueOnce(new Error('tabs.query failed'));
    await initWelcome(document, DESKTOP);

    el('reload-tabs').click();
    await vi.waitFor(() => expect(el<HTMLButtonElement>('reload-tabs').disabled).toBe(false));

    expect(mocks.reloadTabs).not.toHaveBeenCalled();
    expect(el('reload-tabs').textContent).toBe(t('welcomeReloadButton', 'ko', { count: '1' }));
    expect(currentStepId()).toBe('step-reload');
  });

  it('누른 때 확인이 1.5초 안에 끝나지 않으면 다시 누를 수 있고, 다시 누르면 새로고침한다', async () => {
    vi.useFakeTimers();
    mocks.findTabsNeedingReload
      .mockResolvedValueOnce([{ id: 1 }])
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce([{ id: 1 }]);
    await initWelcome(document, DESKTOP);

    el('reload-tabs').click();
    expect(el<HTMLButtonElement>('reload-tabs').disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);

    expect(el<HTMLButtonElement>('reload-tabs').disabled).toBe(false);
    expect(mocks.reloadTabs).not.toHaveBeenCalled();

    el('reload-tabs').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.reloadTabs).toHaveBeenCalledWith([{ id: 1 }]);
    expect(el('reload-tabs').textContent).toBe(t('welcomeReloadDone', 'ko'));
  });
});

describe('팔로잉 페이지 버튼', () => {
  it('X 팔로잉 페이지를 새 탭으로 연다 — X가 본인 핸들 주소로 넘겨준다', async () => {
    await initWelcome(document, DESKTOP);
    el('open-following').click();

    expect(mocks.create).toHaveBeenCalledWith({ url: 'https://x.com/following' });
  });
});

describe('isFirefoxAndroidAgent', () => {
  it.each([
    ['Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0', true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0', false],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', false],
  ])('%s → %s', (agent, expected) => {
    expect(isFirefoxAndroidAgent(agent)).toBe(expected);
  });
});
