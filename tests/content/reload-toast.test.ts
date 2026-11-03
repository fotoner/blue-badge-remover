import { afterEach, describe, expect, it, vi } from 'vitest';
import { showReloadToast } from '../../src/content/reload-toast';

const TEXT = { message: '새로고침하면 Blue Badge Remover가 동작합니다', reload: '새로고침', close: '닫기' };

function toast(): HTMLElement | null {
  return document.getElementById('bbr-reload-toast')?.shadowRoot?.querySelector<HTMLElement>('[role="status"]') ?? null;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  vi.restoreAllMocks();
});

describe('showReloadToast', () => {
  it('문구·새로고침 버튼·닫기 버튼을 그린다', () => {
    showReloadToast(TEXT);

    const box = toast();
    expect(box?.textContent).toContain(TEXT.message);
    const buttons = box?.querySelectorAll('button') ?? [];
    expect(Array.from(buttons, (button) => button.textContent)).toEqual([TEXT.reload, '✕']);
    expect(buttons[1]?.getAttribute('aria-label')).toBe(TEXT.close);
  });

  it('같은 탭에 두 번 넣어도 하나만 남는다', () => {
    showReloadToast(TEXT);
    showReloadToast(TEXT);

    expect(document.querySelectorAll('#bbr-reload-toast')).toHaveLength(1);
  });

  it('닫기를 누르면 사라진다', () => {
    showReloadToast(TEXT);
    toast()?.querySelectorAll('button')[1]?.click();

    expect(document.getElementById('bbr-reload-toast')).toBeNull();
  });

  it('새로고침을 누르면 페이지를 다시 불러온다', () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    showReloadToast(TEXT);
    toast()?.querySelectorAll('button')[0]?.click();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('문구는 HTML로 해석하지 않는다', () => {
    showReloadToast({ ...TEXT, message: '<img src=x onerror=alert(1)>' });

    expect(toast()?.querySelector('img')).toBeNull();
    expect(toast()?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it.each([
    ['rgb(255, 255, 255)', 'light'],
    ['rgb(21, 32, 43)', 'dark'],
    ['rgb(0, 0, 0)', 'dark'],
  ])('X 배경 %s에서는 %s 테마로 그린다', (background, theme) => {
    document.body.style.backgroundColor = background;
    showReloadToast(TEXT);

    expect(toast()?.dataset['theme']).toBe(theme);
    expect(toast()?.style.getPropertyValue('--bbr-bg')).toBe(background);
  });

  // scripting.executeScript는 함수 본문만 페이지로 보낸다 — 모듈 바깥 이름을 쓰면 페이지에서 깨진다
  it('함수 본문만 떼어 실행해도 동작한다', () => {
    const detached = new Function(`return (${showReloadToast.toString()})`)() as typeof showReloadToast;
    detached(TEXT);

    expect(toast()?.textContent).toContain(TEXT.message);
  });
});
