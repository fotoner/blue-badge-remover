import type { BadgeInfo } from '@shared/types';

interface XUserData {
  rest_id?: string;
  is_blue_verified?: boolean;
  verified_type?: string;
  legacy?: {
    verified?: boolean;
    screen_name?: string;
  };
  core?: {
    screen_name?: string;
  };
}

export function parseBadgeInfo(userData: unknown): BadgeInfo | null {
  const data = userData as XUserData;
  if (!data?.rest_id) return null;

  const hasVerifiedType = !!data.verified_type;
  const isLegacyVerified = data.legacy?.verified === true;
  const isBlueFlagged = data.is_blue_verified === true;

  // verified_type이 있으면 is_blue_verified 유무와 무관하게 기관 인증 (non-fadak)
  // is_blue_verified가 boolean이 아닌 경우(undefined)에도 verified_type으로 판단 가능
  if (!isBlueFlagged && !hasVerifiedType && !isLegacyVerified) {
    return null;
  }

  // 파딱 = is_blue_verified가 true이면서 기관/레거시 인증이 아닌 계정
  const isBluePremium = isBlueFlagged && !hasVerifiedType && !isLegacyVerified;
  const handle = data.legacy?.screen_name ?? data.core?.screen_name ?? null;

  return {
    userId: data.rest_id,
    handle,
    isBluePremium,
    isLegacyVerified,
    isBusiness: hasVerifiedType,
  };
}
