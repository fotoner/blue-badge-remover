// #142: MAIN world 가로채기를 실제로 불러와 xweb(api.x.com/graphql) 응답이 프로필·팔로우 메시지로 나가는지,
// 초기 데이터의 본인 계정이 한 번 이상 content script에 가는지 본다. 응답 모양은 2026-11-23 실측(#138)을 따른다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const XWEB_RESPONSE = {
  data: {
    home: {
      entries: [
        {
          result: {
            rest_id: '1',
            core: { name: '파딱 하나', screen_name: 'Fadak_One' },
            verification: { is_blue_verified: true },
            relationship_perspectives: { following: true },
            relationship_counts: { followers: 5000, following: 30 },
            profile_bio: { description: '자기소개' },
          },
        },
        {
          result: {
            rest_id: '2',
            core: { name: '다른 사람', screen_name: 'Other_Two' },
            verification: { is_blue_verified: true },
            relationship_perspectives: { following: false },
          },
        },
      ],
    },
  },
};

type Posted = { type: string; [key: string]: unknown };

const originalFetch = window.fetch;
const originalXhrOpen = XMLHttpRequest.prototype.open;
const originalXhrSend = XMLHttpRequest.prototype.send;
let posted: Posted[];
// 모듈을 다시 불러올 때마다 message 리스너가 쌓인다 — 시험이 끝나면 이번에 붙은 것만 떼어 낸다
let attachedListeners: EventListenerOrEventListenerObject[];

function messagesOf(type: string): Posted[] {
  return posted.filter((message) => message.type === type);
}

async function loadInterceptor(response: unknown = XWEB_RESPONSE): Promise<void> {
  window.fetch = vi.fn(async () => new Response(JSON.stringify(response))) as typeof window.fetch;
  await import('../../src/injected/fetch-interceptor');
}

function contentReady(account?: string): void {
  window.dispatchEvent(new MessageEvent('message', {
    source: window,
    data: account ? { type: 'BBR_CONTENT_READY', account } : { type: 'BBR_CONTENT_READY' },
  }));
}

async function callFetch(url: string): Promise<void> {
  await window.fetch(url);
  // 응답 복제·JSON 파싱은 비동기라 마이크로태스크를 비운다
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  posted = [];
  attachedListeners = [];
  const addListener = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => {
    if (type === 'message') attachedListeners.push(listener);
    addListener(type, listener, options as AddEventListenerOptions);
  }) as typeof window.addEventListener);
  vi.spyOn(window, 'postMessage').mockImplementation(((message: unknown) => {
    posted.push(message as Posted);
  }) as typeof window.postMessage);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const listener of attachedListeners) window.removeEventListener('message', listener);
  window.fetch = originalFetch;
  XMLHttpRequest.prototype.open = originalXhrOpen;
  XMLHttpRequest.prototype.send = originalXhrSend;
  delete (window as unknown as Record<string, unknown>)['__INITIAL_DATA__'];
});

describe('fetch-interceptor — xweb (#142)', () => {
  it('api.x.com/graphql 응답에서 프로필을 읽어 보낸다. 가입일이 없으면 없는 대로 둔다', async () => {
    await loadInterceptor();

    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline?variables=%7B%7D');

    const profiles = messagesOf('BBR_PROFILE_DATA').flatMap((message) => message['profiles'] as Array<Record<string, unknown>>);
    expect(profiles).toContainEqual({
      userId: '1',
      handle: 'Fadak_One',
      displayName: '파딱 하나',
      bio: '자기소개',
      followersCount: 5000,
      followingCount: 30,
    });
    expect(profiles.find((profile) => profile['handle'] === 'Fadak_One')).not.toHaveProperty('createdAt');
  });

  it('content script 준비 전에는 팔로우를 쌓아 두었다가, 준비 신호(본인 계정) 뒤에 팔로우·비팔로우를 보낸다', async () => {
    await loadInterceptor();

    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline');
    expect(messagesOf('BBR_FOLLOW_DATA')).toHaveLength(0);

    contentReady('my_handle');

    const follows = messagesOf('BBR_FOLLOW_DATA');
    expect(follows).toContainEqual({ type: 'BBR_FOLLOW_DATA', handles: ['fadak_one'], account: 'my_handle', source: 'api-timeline' });
    expect(follows).toContainEqual({ type: 'BBR_FOLLOW_DATA', handles: ['other_two'], account: 'my_handle', source: 'api-not-following' });
  });

  it('기존 앱 주소(/i/api/graphql)도 계속 가로챈다', async () => {
    await loadInterceptor();

    await callFetch('https://x.com/i/api/graphql/abc/HomeTimeline');

    expect(messagesOf('BBR_PROFILE_DATA')).not.toHaveLength(0);
  });

  it('GraphQL이 아닌 api.x.com 요청은 읽지 않는다', async () => {
    await loadInterceptor();

    await callFetch('https://api.x.com/1.1/jot/client_event.json');

    expect(messagesOf('BBR_PROFILE_DATA')).toHaveLength(0);
  });

  it('초기 데이터의 viewerScreenName을 시작할 때 보내고, 준비 신호를 받을 때마다 다시 보낸다', async () => {
    (window as unknown as Record<string, unknown>)['__INITIAL_DATA__'] = { viewerScreenName: 'My_Handle', viewerId: '9' };
    await loadInterceptor();

    expect(messagesOf('BBR_VIEWER_HANDLE')).toEqual([{ type: 'BBR_VIEWER_HANDLE', handle: 'My_Handle' }]);

    contentReady();

    expect(messagesOf('BBR_VIEWER_HANDLE')).toHaveLength(2);
  });

  // content script는 document_idle에 시작해 DOM 준비 때 보낸 핸들을 놓칠 수 있다. 시작하자마자 핸들만 다시 달라고 한다 (#142 리뷰 r1)
  it('핸들 요청을 받으면 본인 계정만 다시 보내고 프로필은 재전송하지 않는다', async () => {
    (window as unknown as Record<string, unknown>)['__INITIAL_DATA__'] = { viewerScreenName: 'My_Handle', viewerId: '9' };
    await loadInterceptor();
    await callFetch('https://api.x.com/graphql/abc/HomeTimeline');
    posted.length = 0;

    window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'BBR_VIEWER_HANDLE_REQUEST' } }));

    expect(messagesOf('BBR_VIEWER_HANDLE')).toEqual([{ type: 'BBR_VIEWER_HANDLE', handle: 'My_Handle' }]);
    expect(messagesOf('BBR_PROFILE_DATA')).toHaveLength(0);
  });

  it('초기 데이터가 없으면(기존 앱) 본인 계정 메시지를 보내지 않는다', async () => {
    await loadInterceptor();
    contentReady();

    expect(messagesOf('BBR_VIEWER_HANDLE')).toHaveLength(0);
  });
});

// #142 리뷰 r3 S1-1: 첫 화면 데이터(window.__INITIAL_DATA__)에 들어 있는 사용자도 응답과 같은 경로로 프로필·팔로우 메시지를 낸다.
// 첫 타임라인 응답이 늦게 와도 화면에 이미 그려진 작성자의 팔로우 여부를 content script가 알 수 있게 하기 위해서다. 실측은 아직 없어 합성 데이터로 본다
describe('fetch-interceptor — xweb 초기 데이터의 사용자 (#142 리뷰 r3)', () => {
  const INITIAL_DATA_WITH_USERS = {
    viewerScreenName: 'My_Handle',
    viewerId: '9',
    timeline: {
      entries: [
        {
          rest_id: '11',
          core: { name: '초기 파딱', screen_name: 'Initial_Fadak' },
          verification: { is_blue_verified: true },
          relationship_perspectives: { following: true },
        },
        {
          rest_id: '12',
          core: { name: '초기 낯선 사람', screen_name: 'Initial_Stranger' },
          verification: { is_blue_verified: true },
          relationship_perspectives: { following: false },
        },
      ],
    },
  };

  function setInitialData(data: unknown): void {
    (window as unknown as Record<string, unknown>)['__INITIAL_DATA__'] = data;
  }

  it('시작할 때 초기 데이터의 사용자 프로필을 보내고, 팔로우·비팔로우는 본인 계정이 확정될 때까지 쌓아 둔다', async () => {
    setInitialData(INITIAL_DATA_WITH_USERS);
    await loadInterceptor();

    const profiles = messagesOf('BBR_PROFILE_DATA').flatMap((message) => message['profiles'] as Array<Record<string, unknown>>);
    expect(profiles.map((profile) => profile['handle'])).toEqual(['Initial_Fadak', 'Initial_Stranger']);
    expect(messagesOf('BBR_FOLLOW_DATA')).toHaveLength(0);

    contentReady('my_handle');

    const follows = messagesOf('BBR_FOLLOW_DATA');
    expect(follows).toContainEqual({ type: 'BBR_FOLLOW_DATA', handles: ['initial_fadak'], account: 'my_handle', source: 'api-timeline' });
    expect(follows).toContainEqual({ type: 'BBR_FOLLOW_DATA', handles: ['initial_stranger'], account: 'my_handle', source: 'api-not-following' });
  });

  it('content script가 늦게 시작해도 준비 신호에 맞춰 초기 데이터의 프로필을 다시 보낸다', async () => {
    setInitialData(INITIAL_DATA_WITH_USERS);
    await loadInterceptor();
    posted.length = 0;

    contentReady('my_handle');

    const profiles = messagesOf('BBR_PROFILE_DATA').flatMap((message) => message['profiles'] as Array<Record<string, unknown>>);
    expect(profiles.map((profile) => profile['handle'])).toEqual(['Initial_Fadak', 'Initial_Stranger']);
  });

  it('초기 데이터에 사용자 객체가 없으면 프로필·팔로우 메시지를 아무것도 보내지 않는다', async () => {
    setInitialData({ viewerScreenName: 'My_Handle', viewerId: '9', viewerClaimEntries: [{ rest_id: '9', origin: 'x', resources: [] }] });
    await loadInterceptor();
    contentReady('my_handle');

    expect(messagesOf('BBR_PROFILE_DATA')).toHaveLength(0);
    expect(messagesOf('BBR_FOLLOW_DATA')).toHaveLength(0);
    expect(messagesOf('BBR_VIEWER_HANDLE')).not.toHaveLength(0);
  });

  it('초기 데이터가 없으면(기존 앱) 아무것도 보내지 않는다', async () => {
    await loadInterceptor();
    contentReady('my_handle');

    expect(messagesOf('BBR_PROFILE_DATA')).toHaveLength(0);
    expect(messagesOf('BBR_FOLLOW_DATA')).toHaveLength(0);
  });

  it('초기 데이터를 읽다 실패해도(순환 참조) 시작을 깨뜨리지 않고 본인 계정은 보낸다', async () => {
    const cyclic: Record<string, unknown> = { viewerScreenName: 'My_Handle' };
    cyclic['self'] = cyclic;
    setInitialData(cyclic);

    await loadInterceptor();

    expect(messagesOf('BBR_VIEWER_HANDLE')).toEqual([{ type: 'BBR_VIEWER_HANDLE', handle: 'My_Handle' }]);
    expect(messagesOf('BBR_PROFILE_DATA')).toHaveLength(0);
  });
});

// #142 리뷰 r4 S4-1·S4-2: 본인 계정이 확정되기 전에 같은 사용자의 값이 초기 데이터와 GraphQL 응답으로 두 번 도착하면
// 나중 값이 앞선 값을 대체한다. 오래된 초기 값이 먼저 적용되어 팔로우한 작성자가 잠깐 숨겨졌다 복원되는 일을 막는다
describe('fetch-interceptor — 준비 전에 같은 사용자의 값이 거듭 도착할 때 (#142 리뷰 r4)', () => {
  function userNode(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      rest_id: '11',
      core: { name: '파딱', screen_name: 'Same_Fadak' },
      verification: { is_blue_verified: true },
      ...extra,
    };
  }

  function setInitialData(user: Record<string, unknown>): void {
    (window as unknown as Record<string, unknown>)['__INITIAL_DATA__'] = {
      viewerScreenName: 'My_Handle',
      viewerId: '9',
      timeline: { entries: [user] },
    };
  }

  function followMessages(source: string): string[] {
    return messagesOf('BBR_FOLLOW_DATA')
      .filter((message) => message['source'] === source)
      .flatMap((message) => message['handles'] as string[]);
  }

  function profilesOf(handle: string): Array<Record<string, unknown>> {
    return messagesOf('BBR_PROFILE_DATA')
      .flatMap((message) => message['profiles'] as Array<Record<string, unknown>>)
      .filter((profile) => profile['handle'] === handle);
  }

  it('S4-1: 초기 데이터의 팔로우 안 함 뒤에 GraphQL의 팔로우가 오면, 준비 신호 때 그 핸들은 팔로우로만 나간다', async () => {
    setInitialData(userNode({ relationship_perspectives: { following: false } }));
    await loadInterceptor({ data: { home: { entries: [userNode({ relationship_perspectives: { following: true } })] } } });

    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline');
    contentReady('my_handle');

    expect(followMessages('api-timeline')).toEqual(['same_fadak']);
    expect(followMessages('api-not-following')).toEqual([]);
  });

  it('S4-1: 반대로 초기 데이터의 팔로우 뒤에 GraphQL의 팔로우 안 함이 오면 팔로우 안 함으로만 나간다', async () => {
    setInitialData(userNode({ relationship_perspectives: { following: true } }));
    await loadInterceptor({ data: { home: { entries: [userNode({ relationship_perspectives: { following: false } })] } } });

    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline');
    contentReady('my_handle');

    expect(followMessages('api-not-following')).toEqual(['same_fadak']);
    expect(followMessages('api-timeline')).toEqual([]);
  });

  it('S4-1: 준비 신호 뒤의 응답은 도착 순서대로 바로 나간다', async () => {
    await loadInterceptor({ data: { home: { entries: [userNode({ relationship_perspectives: { following: false } })] } } });
    contentReady('my_handle');
    posted.length = 0;

    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline');

    expect(messagesOf('BBR_FOLLOW_DATA')).toEqual([
      { type: 'BBR_FOLLOW_DATA', handles: ['same_fadak'], account: 'my_handle', source: 'api-not-following' },
    ]);
  });

  it('S4-2: 초기 프로필(자기소개·팔로워 수 없음) 뒤에 GraphQL(둘 다 있음)이 오면, 준비 신호의 재전송에 두 값이 모두 있다', async () => {
    setInitialData(userNode({}));
    await loadInterceptor({
      data: { home: { entries: [userNode({ profile_bio: { description: '자기소개' }, relationship_counts: { followers: 5000, following: 30 } })] } },
    });
    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline');
    posted.length = 0;

    contentReady('my_handle');

    expect(profilesOf('Same_Fadak')).toEqual([{
      userId: '11', handle: 'Same_Fadak', displayName: '파딱', bio: '자기소개', followersCount: 5000, followingCount: 30,
    }]);
  });

  it('S4-2: 후속 응답에 없는 필드는 앞선 값을 유지한다 (자기소개가 있던 프로필에 자기소개 없는 응답이 와도)', async () => {
    setInitialData(userNode({ profile_bio: { description: '앞선 소개' }, relationship_counts: { followers: 7 } }));
    await loadInterceptor({ data: { home: { entries: [userNode({ relationship_counts: { followers: 9 } })] } } });
    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline');
    posted.length = 0;

    contentReady('my_handle');

    expect(profilesOf('Same_Fadak')).toEqual([{
      userId: '11', handle: 'Same_Fadak', displayName: '파딱', bio: '앞선 소개', followersCount: 9,
    }]);
  });

  // #142 리뷰 r5 S5-1: 초기 데이터는 DOM이 준비될 때 읽는 스냅샷이라, 그보다 먼저 도착한 GraphQL보다 오래된 값이다
  it('S5-1: DOM 준비 전에 GraphQL이 먼저 오면, 뒤이어 읽은 초기 데이터의 팔로우 안 함과 옛 프로필이 그 값을 덮지 않는다', async () => {
    setInitialData(userNode({ relationship_perspectives: { following: false }, profile_bio: { description: '옛 소개' } }));
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    await loadInterceptor({
      data: { home: { entries: [userNode({ relationship_perspectives: { following: true }, profile_bio: { description: '새 소개' } })] } },
    });
    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline');
    readyState.mockReturnValue('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    posted.length = 0;

    contentReady('my_handle');

    expect(followMessages('api-timeline')).toEqual(['same_fadak']);
    expect(followMessages('api-not-following')).toEqual([]);
    expect(profilesOf('Same_Fadak')).toEqual([{ userId: '11', handle: 'Same_Fadak', displayName: '파딱', bio: '새 소개' }]);
  });

  it('S5-1: 응답으로 받지 않은 사용자는 초기 데이터에서 그대로 읽는다', async () => {
    setInitialData({ ...userNode({ relationship_perspectives: { following: true } }), rest_id: '13', core: { name: '처음', screen_name: 'Only_Initial' } });
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    await loadInterceptor();
    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline');
    readyState.mockReturnValue('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    contentReady('my_handle');

    expect(followMessages('api-timeline')).toContain('only_initial');
    expect(profilesOf('Only_Initial')).not.toEqual([]);
  });

  it('S4-2: 서로 다른 사용자 ID의 프로필은 합치지 않는다', async () => {
    setInitialData(userNode({ profile_bio: { description: '첫 사용자 소개' } }));
    await loadInterceptor({
      data: { home: { entries: [{ ...userNode({}), rest_id: '12', core: { name: '다른 사람', screen_name: 'Other_Two' } }] } },
    });
    await callFetch('https://api.x.com/graphql/hash123/HomeTimeline');
    posted.length = 0;

    contentReady('my_handle');

    expect(profilesOf('Other_Two')).toEqual([{ userId: '12', handle: 'Other_Two', displayName: '다른 사람', bio: '' }]);
    expect(profilesOf('Same_Fadak')).toEqual([{ userId: '11', handle: 'Same_Fadak', displayName: '파딱', bio: '첫 사용자 소개' }]);
  });
});
