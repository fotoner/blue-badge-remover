import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import { HoverCardObserver, mergeHoverCardBio, shouldObserveHoverCards } from '../../src/content/hover-card-observer';

function makeHoverCard(handle: string, bio: string): HTMLElement {
  const card = document.createElement('div');
  card.dataset.testid = 'HoverCard';
  const link = document.createElement('a');
  link.setAttribute('role', 'link');
  link.href = `/${handle}`;
  const description = document.createElement('div');
  description.dataset.testid = 'UserDescription';
  description.textContent = bio;
  card.append(link, description);
  return card;
}

async function flushMutations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('HoverCardObserver', () => {
  let onBio: ReturnType<typeof vi.fn>;
  let observer: HoverCardObserver;

  beforeEach(() => {
    document.body.innerHTML = '';
    onBio = vi.fn();
    observer = new HoverCardObserver(onBio as (handle: string, bio: string) => void);
  });

  afterEach(() => {
    observer.stop();
  });

  it('키워드 기능이 꺼져 있으면 hover card를 관찰하지 않는다', async () => {
    observer.sync(false, document.body);
    document.body.appendChild(makeHoverCard('alice', 'bio'));
    await flushMutations();

    expect(onBio).not.toHaveBeenCalled();
  });

  it('키워드 기능이 켜져 있으면 추가된 hover card의 bio를 전달한다', async () => {
    observer.sync(true, document.body);
    document.body.appendChild(makeHoverCard('Alice', 'hello world'));
    await flushMutations();

    expect(onBio).toHaveBeenCalledOnce();
    expect(onBio).toHaveBeenCalledWith('alice', 'hello world');
  });

  it('활성 상태에서 비활성화하면 이후 mutation을 처리하지 않는다', async () => {
    observer.sync(true, document.body);
    observer.sync(false, document.body);
    document.body.appendChild(makeHoverCard('alice', 'bio'));
    await flushMutations();

    expect(onBio).not.toHaveBeenCalled();
  });
});

describe('hover card profile helpers', () => {
  it('보호 키워드만 등록돼 있어도 hover card를 관찰한다', () => {
    expect(shouldObserveHoverCards(DEFAULT_SETTINGS, ['game'])).toBe(true);
  });

  it('캐시가 없는 계정의 bio도 새 프로필로 저장할 수 있게 병합한다', () => {
    expect(mergeHoverCardBio(undefined, 'alice', 'game creator')).toEqual({
      handle: 'alice',
      displayName: 'alice',
      bio: 'game creator',
    });
  });

  it('기존 프로필 통계는 유지하면서 bio만 채운다', () => {
    const profile = mergeHoverCardBio({
      handle: 'Alice',
      displayName: 'Alice Kim',
      bio: '',
      followersCount: 2000,
    }, 'alice', 'game creator');

    expect(profile).toMatchObject({
      handle: 'Alice',
      displayName: 'Alice Kim',
      bio: 'game creator',
      followersCount: 2000,
    });
  });
});
