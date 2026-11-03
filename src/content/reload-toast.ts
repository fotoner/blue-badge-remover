// src/content/reload-toast.ts
// 설치·업데이트 직후 이미 열린 X 탭에 백그라운드가 scripting.executeScript로 넣는 새로고침 안내 (#121).
// 함수 본문만 직렬화돼 페이지에서 실행된다 — 본문 밖의 이름(import 값·모듈 상수)을 쓰면 안 된다.
import type { ReloadToastText } from '@features/reload-notice';

export function showReloadToast(text: ReloadToastText): void {
  const hostId = 'bbr-reload-toast';
  if (document.getElementById(hostId)) return;

  // X 테마(기본·어둡게·검게)는 body 배경색으로 고른다 — 읽지 못하면 기본(밝게)
  const background = getComputedStyle(document.body).backgroundColor;
  const [r = 255, g = 255, b = 255, a = 1] = (background.match(/[\d.]+/g) ?? []).map(Number);
  const known = /^rgba?\(/.test(background) && a !== 0;
  const theme = known && r + g + b <= 382 ? 'dark' : 'light';

  const host = document.createElement('div');
  host.id = hostId;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:12px;
  width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;padding:12px 12px 12px 16px;border-radius:16px;background:var(--bbr-bg);
  font:400 15px/20px TwitterChirp,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.toast[data-theme=dark]{color:#e7e9ea;box-shadow:rgba(255,255,255,.2) 0 0 15px,rgba(255,255,255,.15) 0 0 3px 1px}
.toast[data-theme=light]{color:#0f1419;box-shadow:rgba(101,119,134,.2) 0 0 15px,rgba(101,119,134,.15) 0 0 3px 1px}
button{flex-shrink:0;height:32px;border:none;border-radius:9999px;font:inherit;cursor:pointer}
.reload{padding:0 16px;font-size:14px;font-weight:700}
.toast[data-theme=dark] .reload{background:#eff3f4;color:#0f1419}
.toast[data-theme=light] .reload{background:#0f1419;color:#fff}
.close{width:32px;background:transparent;color:inherit;opacity:.6}
.close:hover{opacity:1}
</style><div class="toast" role="status"><span></span><button type="button" class="reload"></button><button type="button" class="close">✕</button></div>`;

  const box = root.querySelector<HTMLElement>('.toast')!;
  box.dataset['theme'] = theme;
  box.style.setProperty('--bbr-bg', known ? background : 'rgb(255, 255, 255)');
  box.querySelector('span')!.textContent = text.message;
  const [reload, close] = Array.from(box.querySelectorAll('button'));
  reload!.textContent = text.reload;
  reload!.addEventListener('click', () => window.location.reload());
  close!.setAttribute('aria-label', text.close);
  close!.addEventListener('click', () => host.remove());
  document.body.append(host);
}
