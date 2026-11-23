// src/content/xweb-dom.ts
// 새 웹 앱(xweb)의 트윗 DOM에서 값을 뽑는 함수 모음 (#142).
// 2026-11-23 로그인 한국어 화면 실측(tests/fixtures/x-dom/xweb-*.html): 기존 앱의 data-testid·User-Name·icon-verified가 없다.
// 작성자 머리글은 .x-middot-group, 배지는 svg > use[href], 인용은 data-slot="embedded-tweet-frame"로 읽는다.
// 화면 문구(aria-label 등)에는 기대지 않는다 (CNT-3). 판정(파딱 여부)은 badge-detection 쪽이 한다 (CNT-1).
import { XWEB_BADGE_SELECTOR } from '@shared/constants';

export const XWEB_QUOTE_FRAME_SELECTOR = '[data-slot="embedded-tweet-frame"]';
const HEADER_GROUP_SELECTOR = '.x-middot-group';
const PROFILE_LINK_SELECTOR = 'a[href^="/"]';
const AVATAR_SELECTOR = '.x-avatar';
const PROFILE_HREF = /^\/([A-Za-z0-9_]{1,15})$/;
const AT_HANDLE_TEXT = /^@([A-Za-z0-9_]{1,15})$/;
const STATUS_PATH = /\/\w+\/status\/\d+/;
const BODY_SELECTOR = '[dir="auto"]';
// Grok 번역 표시(아이콘 + 번역 안내 문구 + 버튼)의 아이콘. 이 줄의 문구는 본문이 아니다 (#142)
const GROK_ICON_SELECTOR = '[data-icon="icon-logo-grok"]';
// 머리글(표시 이름)·버튼·링크 안의 [dir="auto"]는 본문이 아니다
const NON_BODY_ANCESTOR_SELECTOR = `${HEADER_GROUP_SELECTOR}, button, [role="button"], a`;

export interface XwebAuthor {
  handle: string;
  displayName: string | null;
}

/** 요소가 xweb 인용 프레임 컨테이너 자신인지 */
export function isXwebQuoteFrame(el: Element): boolean {
  return el.matches(XWEB_QUOTE_FRAME_SELECTOR);
}

/** 트윗 안 인용 프레임(인용된 트윗). 없으면 null */
export function findXwebQuoteFrame(tweetEl: HTMLElement): HTMLElement | null {
  return tweetEl.querySelector<HTMLElement>(XWEB_QUOTE_FRAME_SELECTOR);
}

/** root 안 요소가 root 바깥이 아닌 '안쪽 인용 프레임'에 들어 있는지. root가 프레임 자신이면 그 안은 바깥으로 본다 */
function isInNestedFrame(el: Element, root: HTMLElement): boolean {
  const frame = el.closest(XWEB_QUOTE_FRAME_SELECTOR);
  return frame !== null && frame !== root && root.contains(frame);
}

function outsideFrame<T extends Element>(root: HTMLElement, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector)).filter((el) => !isInNestedFrame(el, root));
}

/** 작성자 머리글(이름·배지·@핸들·시간을 묶은 .x-middot-group). root 안 인용 프레임 밖 첫 것 */
function findHeaderGroup(root: HTMLElement): HTMLElement | null {
  return outsideFrame<HTMLElement>(root, HEADER_GROUP_SELECTOR)[0] ?? null;
}

function profileHandle(link: Element): string | null {
  return PROFILE_HREF.exec(link.getAttribute('href') ?? '')?.[1] ?? null;
}

/** 머리글에서 텍스트가 정확히 @핸들인 프로필 링크의 핸들 (CNT-4: 표시 이름이 아니라 이 텍스트를 믿는다) */
function handleFromAtLink(group: HTMLElement): string | null {
  for (const link of group.querySelectorAll(PROFILE_LINK_SELECTOR)) {
    const handle = profileHandle(link);
    const text = AT_HANDLE_TEXT.exec(link.textContent?.trim() ?? '')?.[1];
    if (handle && text && handle.toLowerCase() === text.toLowerCase()) return handle;
  }
  return null;
}

/** 아바타(.x-avatar)를 품은 프로필 링크의 핸들. @핸들 링크를 못 찾았을 때의 대체 */
function handleFromAvatarLink(root: HTMLElement): string | null {
  for (const link of outsideFrame<HTMLAnchorElement>(root, PROFILE_LINK_SELECTOR)) {
    const handle = link.querySelector(AVATAR_SELECTOR) ? profileHandle(link) : null;
    if (handle) return handle;
  }
  return null;
}

function displayNameFromGroup(group: HTMLElement, handle: string): string | null {
  for (const link of group.querySelectorAll(PROFILE_LINK_SELECTOR)) {
    if (profileHandle(link)?.toLowerCase() !== handle.toLowerCase()) continue;
    const text = link.textContent?.trim();
    if (text && !text.startsWith('@')) return text;
  }
  return null;
}

/**
 * root(트윗 article 또는 인용 프레임) 안 인용 프레임 밖 작성자.
 * xweb 머리글이 없는 DOM이면 null — 호출자가 기존 앱 경로로 넘어간다.
 */
export function readXwebAuthor(root: HTMLElement): XwebAuthor | null {
  const group = findHeaderGroup(root);
  const handle = (group && handleFromAtLink(group)) ?? handleFromAvatarLink(root);
  if (!handle) return null;
  return { handle, displayName: group ? displayNameFromGroup(group, handle) : null };
}

/**
 * 작성자 배지(svg > use). 머리글이 있으면 그 안만 보고, 없으면 인용 프레임 밖 첫 배지를 본다.
 * 인용된 트윗의 배지를 작성자 것으로 보지 않는다 (#35).
 */
export function findXwebAuthorBadge(root: HTMLElement): Element | null {
  const group = findHeaderGroup(root);
  if (group) return group.querySelector(XWEB_BADGE_SELECTOR);
  return outsideFrame<Element>(root, XWEB_BADGE_SELECTOR)[0] ?? null;
}

/**
 * 상태 경로(/핸들/status/ID): 컨테이너 data-href → 머리글의 상태 링크.
 * 트윗 선택자가 xweb article을 data-href 컨테이너의 직계 자식으로만 잡으므로 보통 앞의 것으로 정해진다.
 * 인용 프레임·본문 링크는 보지 않는다 — 다른 트윗의 경로를 이 트윗 것으로 잘못 읽지 않기 위해서다.
 */
export function readXwebStatusPath(tweetEl: HTMLElement): string | null {
  const fromContainer = STATUS_PATH.exec(tweetEl.parentElement?.getAttribute('data-href') ?? '')?.[0];
  if (fromContainer) return fromContainer;
  const group = findHeaderGroup(tweetEl);
  if (!group) return null;
  for (const link of group.querySelectorAll('a[href*="/status/"]')) {
    const match = STATUS_PATH.exec(link.getAttribute('href') ?? '')?.[0];
    if (match) return match;
  }
  return null;
}

function isInsideNonBody(el: Element, root: HTMLElement): boolean {
  const ancestor = el.closest(NON_BODY_ANCESTOR_SELECTOR);
  return ancestor !== null && ancestor !== root && root.contains(ancestor);
}

/**
 * Grok 번역 표시 줄들. 아이콘을 감싼 요소의 부모가 그 줄이고, 줄에는 아이콘 말고 안내 문구·버튼이 함께 있다 (#142).
 * 위로 더 올라가지 않는다 — 아이콘만 있는 번역 표시가 본문과 나란히 있을 때 본문까지 줄로 묶이기 때문이다.
 * 머리글을 품은 부모는 줄이 아니라 레이아웃 컨테이너이고, 곁에 본문 자리([dir="auto"])뿐인 부모도 번역 표시 줄이 아니다.
 * 인용 프레임 안의 아이콘은 그 프레임의 번역 표시이므로 세지 않는다.
 */
function findTranslationNotes(root: HTMLElement, header: HTMLElement): HTMLElement[] {
  return outsideFrame<Element>(root, GROK_ICON_SELECTOR).flatMap((icon) => {
    const wrapper = icon.parentElement;
    const line = wrapper?.parentElement;
    if (!wrapper || !line || line.contains(header)) return [];
    const hasNoteContent = Array.from(line.children).some((child) => child !== wrapper && !child.matches(BODY_SELECTOR));
    return hasNoteContent ? [line] : [];
  });
}

/**
 * 본문(키워드 판정용). 실측 구조상 본문은 작성자 머리글 뒤에 오는 첫 div[dir="auto"] 하나다(2026-11-23 픽스처).
 * 머리글의 표시 이름, 링크·버튼 안, 번역 표시 줄, 인용 프레임 안의 [dir="auto"]는 후보에서 뺀다.
 * 뒤쪽 영역(링크 미리보기 등)의 [dir="auto"] 문구는 본문이 아니므로 첫 하나만 읽는다 (#142)
 * 머리글이 없으면(기존 앱 DOM) 읽지 않는다 — 기존 앱의 작성자 영역 [dir="auto"]를 본문으로 오인하지 않기 위해서다.
 */
export function readXwebText(root: HTMLElement): string {
  const header = findHeaderGroup(root);
  if (!header) return '';
  const notes = findTranslationNotes(root, header);
  const body = outsideFrame<HTMLElement>(root, BODY_SELECTOR).find((el) =>
    (header.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    && !isInsideNonBody(el, root)
    && !notes.some((note) => note.contains(el)));
  return body?.textContent?.trim() ?? '';
}
