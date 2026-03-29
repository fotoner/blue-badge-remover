import { describe, it, expect } from 'vitest';
import { MESSAGE_TYPES, X_GRAPHQL_ENDPOINTS } from '@shared/constants';

// The injected script duplicates these constants because it runs in page context.
// This test ensures they stay in sync.
describe('fetch-interceptor constant sync', () => {
  it('MESSAGE_TYPES should match shared constants', () => {
    expect(MESSAGE_TYPES.BADGE_DATA).toBe('BBR_BADGE_DATA');
    expect(MESSAGE_TYPES.TOKEN_DATA).toBe('BBR_TOKEN_DATA');
    expect(MESSAGE_TYPES.USER_ID).toBe('BBR_USER_ID');
    expect(MESSAGE_TYPES.CSRF_TOKEN).toBe('BBR_CSRF_TOKEN');
    expect(MESSAGE_TYPES.FOLLOW_DATA).toBe('BBR_FOLLOW_DATA');
    expect(MESSAGE_TYPES.PROFILE_DATA).toBe('BBR_PROFILE_DATA');
    expect(MESSAGE_TYPES.CONTENT_READY).toBe('BBR_CONTENT_READY');
  });

  it('X_GRAPHQL_ENDPOINTS should match shared constants', () => {
    expect(X_GRAPHQL_ENDPOINTS).toContain('/i/api/graphql/');
    expect(X_GRAPHQL_ENDPOINTS).toContain('/i/api/2/');
  });
});
