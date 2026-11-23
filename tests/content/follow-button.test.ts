// tests/content/follow-button.test.ts
// 손으로 만든 DOM이다(실측 아님). 버튼 testid 규약(`<id>-follow`·`<id>-unfollow`)은 2026-11-23 한국어 화면 실측 픽스처
// (tests/fixtures/x-dom/user-cell-*.html)로 고정했고, 일본어 aria-label 형태는 미실측이다 (#111).
import { describe, it, expect } from 'vitest';
import {
  FOLLOW_BUTTON_SELECTOR,
  readFollowButton,
  readFollowState,
} from '../../src/content/follow-button';

function button(testId: string | null, label: string | null): HTMLElement {
  const el = document.createElement('button');
  if (testId !== null) el.setAttribute('data-testid', testId);
  if (label !== null) el.setAttribute('aria-label', label);
  return el;
}

describe('readFollowButton (손으로 만든 DOM, 실측 아님)', () => {
  it.each([
    ['한국어 팔로잉', '123-unfollow', '팔로잉 @Alice', 'Alice', true],
    ['영어 Following', '123-unfollow', 'Following @Alice', 'Alice', true],
    ['영어 Follow', '123-follow', 'Follow @Alice', 'Alice', false],
    ['일본어 팔로우 중', '123-unfollow', '@Aliceさんをフォロー中', 'Alice', true],
    ['일본어 팔로우', '123-follow', '@Aliceさんをフォロー', 'Alice', false],
  ])('%s 화면: testid로 상태, aria-label의 @handle로 핸들을 읽는다', (_name, testId, label, handle, following) => {
    expect(readFollowButton(button(testId, label))).toEqual({ handle, following });
  });

  it('화면 문구가 아니라 testid가 상태를 정한다: testid가 -follow면 라벨이 팔로잉 문구여도 팔로우 전이다', () => {
    expect(readFollowButton(button('123-follow', 'Following @alice'))).toEqual({ handle: 'alice', following: false });
  });

  it('testid가 없는 버튼은 라벨이 "Follow @alice"여도 판정하지 않는다 (화면 문구로 되돌아가지 않음)', () => {
    expect(readFollowButton(button(null, 'Follow @alice'))).toBeNull();
    expect(readFollowButton(button('caret', 'Following @alice'))).toBeNull();
  });

  it('aria-label에 @handle이 없으면 null', () => {
    expect(readFollowButton(button('123-follow', 'フォロー'))).toBeNull();
    expect(readFollowButton(button('123-follow', null))).toBeNull();
  });

  it('핸들 규칙(영숫자·밑줄 15자)에 맞지 않는 @토큰은 핸들로 쓰지 않는다', () => {
    expect(readFollowButton(button('123-follow', '@abcdefghijklmnop1 をフォロー'))).toBeNull();
    expect(readFollowButton(button('123-follow', '@한글 をフォロー'))).toBeNull();
  });
});

describe('readFollowState', () => {
  it('testid 접미사만으로 상태를 읽는다 (라벨이 바뀌어도 영향 없음)', () => {
    expect(readFollowState(button('9-unfollow', null))).toBe(true);
    expect(readFollowState(button('9-follow', null))).toBe(false);
    expect(readFollowState(button(null, 'Follow @alice'))).toBeNull();
    expect(readFollowState(button('9-followers', null))).toBeNull();
  });
});

describe('FOLLOW_BUTTON_SELECTOR', () => {
  it('-follow·-unfollow testid만 고른다', () => {
    document.body.innerHTML = [
      '<button data-testid="1-follow"></button>',
      '<button data-testid="2-unfollow"></button>',
      '<button data-testid="caret"></button>',
      '<button data-testid="3-followers"></button>',
    ].join('');
    const ids = [...document.querySelectorAll(FOLLOW_BUTTON_SELECTOR)].map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['1-follow', '2-unfollow']);
  });
});
