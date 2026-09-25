// src/options/inline-confirm.ts
// 내장형 옵션 페이지(options_ui, open_in_tab: false)에서는 window.confirm이 차단된다
// (Chrome: cross-origin subframe 대화상자 차단, Firefox: about:addons 내장 페이지 미지원).
// 페이지 안에 확인/취소 버튼을 띄워 대신 묻는다.

export function askInlineConfirm(container: HTMLElement, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const text = document.createElement('p');
    text.className = 'inline-confirm-message';
    text.textContent = message;

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn-primary';
    yes.dataset['confirm'] = 'yes';
    yes.textContent = confirmLabel;

    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn-secondary';
    no.dataset['confirm'] = 'no';
    no.textContent = '취소';

    const actions = document.createElement('div');
    actions.className = 'btn-row';
    actions.append(yes, no);

    const finish = (answer: boolean): void => {
      container.replaceChildren();
      container.hidden = true;
      resolve(answer);
    };
    yes.addEventListener('click', () => finish(true), { once: true });
    no.addEventListener('click', () => finish(false), { once: true });

    container.replaceChildren(text, actions);
    container.hidden = false;
    yes.focus();
  });
}
