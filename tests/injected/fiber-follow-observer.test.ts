import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FiberFollowObserver,
  extractArticleDataFromFiber,
} from '../../src/injected/fiber-follow-observer';

function makeFiberArticle(handle: string, following = true): HTMLElement {
  const article = document.createElement('article');
  article.dataset.testid = 'tweet';
  Object.defineProperty(article, '__reactFiber$test', {
    configurable: true,
    value: {
      memoizedProps: {
        user: { screen_name: handle, following },
      },
    },
  });
  return article;
}

async function flushMutations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('extractArticleDataFromFiber', () => {
  it('React fiber props에서 팔로우 핸들을 추출한다', () => {
    const article = makeFiberArticle('Alice');

    expect(extractArticleDataFromFiber(article)).toEqual({
      handle: 'Alice',
      following: true,
    });
  });

  it('지정 깊이를 넘는 props는 탐색하지 않는다', () => {
    const article = document.createElement('article');
    let nested: Record<string, unknown> = { screen_name: 'too-deep', following: true };
    for (let i = 0; i < 25; i++) nested = { child: nested };
    Object.defineProperty(article, '__reactFiber$test', {
      value: { memoizedProps: nested },
    });

    expect(extractArticleDataFromFiber(article)).toBeNull();
  });
});

describe('FiberFollowObserver', () => {
  let rafCallbacks: FrameRequestCallback[];
  let observer: FiberFollowObserver;
  let onHandles: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }));
    onHandles = vi.fn();
    observer = new FiberFollowObserver(onHandles as (handles: string[]) => void);
    observer.start(document.body);
  });

  afterEach(() => {
    observer.stop();
    vi.unstubAllGlobals();
  });

  it('content script 준비 전에는 fiber를 스캔하지 않고 준비 후 한 프레임에 배치한다', async () => {
    document.body.append(makeFiberArticle('Alice'), makeFiberArticle('Bob'));
    await flushMutations();

    expect(rafCallbacks).toHaveLength(0);
    expect(onHandles).not.toHaveBeenCalled();

    observer.markContentReady();
    expect(rafCallbacks).toHaveLength(1);
    rafCallbacks.shift()?.(0);

    expect(onHandles).toHaveBeenCalledOnce();
    expect(onHandles).toHaveBeenCalledWith(['alice', 'bob']);
  });

  // xweb(#142): article에 data-testid가 없고 data-href 컨테이너의 직계 자식이다. fiber props 모양은 xweb에서 미실측이라 기존 모양으로 시험한다
  it('xweb 컨테이너의 article도 스캔하고, 인용 프레임 안 article은 스캔하지 않는다', async () => {
    observer.markContentReady();
    const container = document.createElement('div');
    container.setAttribute('data-href', '/user_1/status/1');
    const article = makeFiberArticle('Alice');
    article.removeAttribute('data-testid');
    const frame = document.createElement('div');
    frame.setAttribute('data-href', '/user_2/status/2');
    frame.setAttribute('data-slot', 'embedded-tweet-frame');
    const frameArticle = makeFiberArticle('Quoted');
    frameArticle.removeAttribute('data-testid');
    frame.appendChild(frameArticle);
    article.appendChild(frame);
    container.appendChild(article);
    document.body.appendChild(container);
    await flushMutations();
    rafCallbacks.shift()?.(0);

    expect(onHandles).toHaveBeenCalledOnce();
    expect(onHandles).toHaveBeenCalledWith(['alice']);
  });

  it('같은 article과 이미 보고한 핸들은 다시 post하지 않는다', async () => {
    observer.markContentReady();
    const first = makeFiberArticle('Alice');
    document.body.appendChild(first);
    await flushMutations();
    rafCallbacks.shift()?.(0);
    expect(onHandles).toHaveBeenCalledWith(['alice']);

    document.body.removeChild(first);
    document.body.append(first, makeFiberArticle('ALICE'));
    await flushMutations();
    rafCallbacks.shift()?.(0);

    expect(onHandles).toHaveBeenCalledTimes(1);
  });

  it('처음 스캔할 때 fiber가 없으면 내부 mutation 뒤 다시 시도한다', async () => {
    observer.markContentReady();
    const article = document.createElement('article');
    article.dataset.testid = 'tweet';
    document.body.appendChild(article);
    await flushMutations();
    rafCallbacks.shift()?.(0);
    expect(onHandles).not.toHaveBeenCalled();

    Object.defineProperty(article, '__reactFiber$late', {
      configurable: true,
      value: { memoizedProps: { user: { screen_name: 'LateUser', following: true } } },
    });
    article.appendChild(document.createElement('span'));
    await flushMutations();
    rafCallbacks.shift()?.(0);

    expect(onHandles).toHaveBeenCalledWith(['lateuser']);
  });

  it('stop 후 들어온 article은 처리하지 않는다', async () => {
    observer.markContentReady();
    observer.stop();
    document.body.appendChild(makeFiberArticle('Alice'));
    await flushMutations();

    expect(rafCallbacks).toHaveLength(0);
    expect(onHandles).not.toHaveBeenCalled();
  });
});
