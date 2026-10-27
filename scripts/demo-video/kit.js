// 데모 영상 공통 키트 — releases/<버전>.html이 <script src="../kit.js">로 불러 BBRDemo.run(...)을 호출한다.
// 화면은 시간 t에서만 계산한다(프레임마다 같은 결과). README.md 참고.
window.BBRDemo = (() => {
  const SHIELD = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L2 3.5v4c0 3.5 2.6 6.4 6 7.5 3.4-1.1 6-4 6-7.5v-4L8 1zm0 2.2l4 1.7v2.6c0 2.6-1.9 4.8-4 5.7-2.1-.9-4-3.1-4-5.7V4.9l4-1.7z"/></svg>';
  const BADGE = '<svg class="badge" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#1d9bf0"/><path d="M6.6 11.3l3 3 5.9-6.3" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CURSOR = '<svg id="cursor" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.2 14.2 L10 20.5 L12.8 19.3 L10.1 13.1 L15.8 13.1 Z" fill="#fff" stroke="#0e1418" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const STAGE_WIDTH = 1280;
  const FADE = 0.25;

  // ── 화면 조각 ──
  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function tweet(a, text, time, attrs = '') {
    const meta = `<b>${a.name}</b>${a.fadak ? BADGE : ''}<span class="h">@${a.handle}${time ? ` · ${time}` : ''}</span>`;
    return `<div class="tweet"${attrs}><div class="avatar" style="background:${a.color}"></div><div><div class="tw-meta">${meta}</div><div class="tw-text">${text}</div></div></div>`;
  }
  function focal(a, text, time) {
    return `<div class="focal"><div class="row"><div class="avatar" style="background:${a.color}"></div><div class="tw-meta"><b>${a.name}</b>${a.fadak ? BADGE : ''}<span class="h">@${a.handle}</span></div></div><div class="tw-text">${text}</div><div class="time">${time}</div></div>`;
  }
  // 확장의 접힘 표시 — 문구는 hiddenTweetFadak 번역과 같다
  function hiddenRow(a) {
    return `<div class="hidden-row">${SHIELD}<span>파딱 @${a.handle}의 트윗이 숨겨졌습니다 (클릭하여 펼치기)</span></div>`;
  }

  // ── 시간 ──
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const out = (x) => 1 - Math.pow(1 - x, 3);
  function center(el) {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }
  // [[t, x, y], …] 사이를 부드럽게 잇는 커서 위치
  function cursorAt(points, t) {
    let pos = points[0].slice(1);
    for (let i = 1; i < points.length; i++) {
      const [t0, x0, y0] = points[i - 1];
      const [t1, x1, y1] = points[i];
      if (t >= t1) { pos = [x1, y1]; continue; }
      if (t > t0) { const p = ease(prog(t, t0, t1)); pos = [x0 + (x1 - x0) * p, y0 + (y1 - y0) * p]; }
      break;
    }
    return pos;
  }
  const pressed = (t, clicks) => clicks.some((c) => t >= c && t < c + 0.12);
  // 토글 스위치 (0 꺼짐 … 1 켜짐)
  function setSwitch(sw, on) {
    sw.style.background = on > 0.5 ? 'var(--accent)' : 'var(--surface-3)';
    sw.querySelector('i').style.transform = `translateX(${16 * on}px)`;
  }
  // 칸이 펼쳐지며 나타남 (0 … 1) — 높이는 안쪽 요소 기준이라 넘치는 장식이 높이에 더해지지 않는다
  function grow(box, amount) {
    box.style.height = `${box.firstElementChild.offsetHeight * amount}px`;
    box.style.opacity = amount;
  }

  // ── 장면 실행 ──
  function timeline(scenes, endDuration, clipId) {
    if (clipId) {
      const scene = scenes.find((s) => s.id === clipId);
      if (!scene) throw new Error(`없는 장면: ${clipId}`);
      return [{ scene, start: 0, end: scene.loopDuration ?? scene.duration }];
    }
    let start = 0;
    const items = scenes.map((scene) => { const item = { scene, start, end: start + scene.duration }; start = item.end; return item; });
    return [...items, { scene: null, start, end: start + endDuration }];
  }
  function alphaOf(item, t, fade) {
    if (t < item.start || t > item.end) return 0;
    return fade ? Math.min(prog(t, item.start, item.start + fade), 1 - prog(t, item.end - fade, item.end)) : 1;
  }

  function run({ version, where, scenes, endDuration = 2.8 }) {
    const stage = h('<div id="stage"></div>');
    document.body.append(stage);
    stage.append(h(`<div class="brand">Blue Badge Remover<span>${version}</span></div>`));
    for (const scene of scenes) {
      const el = h(`<div class="scene" id="scene-${scene.id}" style="left:${(STAGE_WIDTH - scene.width) / 2}px;width:${scene.width}px"></div>`);
      stage.append(el);
      scene.el = el;
      scene.mount(el);
    }
    const end = h(`<div class="end"><h1>Blue Badge Remover<span>${version}</span></h1><div class="where">${where}</div></div>`);
    stage.append(end, h(CURSOR));
    const cursor = document.getElementById('cursor');

    const clipId = new URLSearchParams(location.search).get('clip');
    const items = timeline(scenes, endDuration, clipId);
    const fade = clipId ? 0 : FADE;
    window.DURATION = items[items.length - 1].end;
    window.SCENE_IDS = scenes.map((s) => s.id);
    window.render = (t) => {
      let shown = null;
      end.style.display = 'none';
      for (const s of scenes) s.el.style.display = 'none';
      for (const item of items) {
        const alpha = alphaOf(item, t, fade);
        if (alpha <= 0) continue;
        const el = item.scene ? item.scene.el : end;
        el.style.display = 'block';
        el.style.opacity = alpha;
        if (!item.scene) continue;
        const result = item.scene.render(t - item.start, { loop: Boolean(clipId) }) ?? {};
        if (result.cursor && (!shown || alpha > shown.alpha)) shown = { ...result, alpha };
      }
      cursor.style.display = shown ? 'block' : 'none';
      if (shown) {
        const [x, y] = shown.cursor;
        cursor.style.transform = `translate(${x - 2}px, ${y - 2}px) scale(${shown.press ? 0.86 : 1})`;
        cursor.style.opacity = shown.alpha;
      }
    };
    window.render(0);
  }

  return { SHIELD, BADGE, h, tweet, focal, hiddenRow, clamp, prog, ease, out, center, cursorAt, pressed, setSwitch, grow, run };
})();
