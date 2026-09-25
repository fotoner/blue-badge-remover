import { beforeEach, describe, expect, it } from 'vitest';
import { askInlineConfirm } from '../../src/options/inline-confirm';

// 내장형 옵션 페이지(options_ui, open_in_tab: false)에서는 window.confirm이 차단되므로 페이지 안에서 확인한다
describe('askInlineConfirm', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="confirm-box" hidden></div>';
    container = document.getElementById('confirm-box') as HTMLDivElement;
  });

  it('메시지와 확인/취소 버튼을 보여주고 확인 시 true로 끝난다', async () => {
    const answer = askInlineConfirm(container, '목록을 바꿀까요?', '바꾸기');
    expect(container.hidden).toBe(false);
    expect(container.textContent).toContain('목록을 바꿀까요?');
    container.querySelector<HTMLButtonElement>('[data-confirm="yes"]')!.click();
    await expect(answer).resolves.toBe(true);
    expect(container.hidden).toBe(true);
    expect(container.childElementCount).toBe(0);
  });

  it('취소 시 false로 끝난다', async () => {
    const answer = askInlineConfirm(container, '목록을 바꿀까요?', '바꾸기');
    container.querySelector<HTMLButtonElement>('[data-confirm="no"]')!.click();
    await expect(answer).resolves.toBe(false);
    expect(container.hidden).toBe(true);
  });

  it('메시지는 텍스트로만 넣는다 (HTML 해석 금지)', () => {
    void askInlineConfirm(container, '<img src=x onerror=alert(1)>', '확인');
    expect(container.querySelector('img')).toBeNull();
  });
});
