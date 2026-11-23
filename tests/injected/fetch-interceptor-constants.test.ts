import { describe, it, expect } from 'vitest';
import { MESSAGE_TYPES, X_API_GRAPHQL_HOSTS, X_GRAPHQL_ENDPOINTS } from '@shared/constants';
import { isGraphqlRequestUrl } from '../../src/injected/data-extractors';

// The injected script duplicates these constants because it runs in page context.
// This test ensures they stay in sync.
describe('fetch-interceptor constant sync', () => {
  it('MESSAGE_TYPES should match shared constants', () => {
    expect(MESSAGE_TYPES.FOLLOW_DATA).toBe('BBR_FOLLOW_DATA');
    expect(MESSAGE_TYPES.PROFILE_DATA).toBe('BBR_PROFILE_DATA');
    expect(MESSAGE_TYPES.CONTENT_READY).toBe('BBR_CONTENT_READY');
    expect(MESSAGE_TYPES.VIEWER_HANDLE).toBe('BBR_VIEWER_HANDLE');
    expect(MESSAGE_TYPES.VIEWER_HANDLE_REQUEST).toBe('BBR_VIEWER_HANDLE_REQUEST');
  });

  it('X_GRAPHQL_ENDPOINTS should match shared constants', () => {
    expect(X_GRAPHQL_ENDPOINTS).toContain('/i/api/graphql/');
    expect(X_GRAPHQL_ENDPOINTS).toContain('/i/api/2/');
  });

  it('공유 X_GRAPHQL_ENDPOINTS 경로는 MAIN world 가로채기 판정도 통과한다 (#142)', () => {
    for (const endpoint of X_GRAPHQL_ENDPOINTS) {
      expect(isGraphqlRequestUrl(`https://x.com${endpoint}abc/Operation`)).toBe(true);
    }
  });

  it('공유 X_API_GRAPHQL_HOSTS(xweb)의 /graphql/ 주소도 MAIN world 가로채기 판정을 통과한다 (#142)', () => {
    for (const host of X_API_GRAPHQL_HOSTS) {
      expect(isGraphqlRequestUrl(`https://${host}/graphql/hash/Operation`)).toBe(true);
    }
  });
});
